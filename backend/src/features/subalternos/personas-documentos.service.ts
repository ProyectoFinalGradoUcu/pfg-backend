import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { ArchivosService, calcularSha256 } from '../archivos/archivos.service.js';
import type { ArchivoConStream } from '../archivos/archivos.service.js';
import type { MetadatosArchivo } from '../archivos/archivos.http.js';
import {
  buscarDuplicado,
  buscarPorDescripcion,
  mensajeDuplicado,
} from './personas-documentos.duplicados.js';
import { assertPersonaAccesible } from './persona-accesible.js';
import { ActualizarDocumentoDto, SubirDocumentoDto } from './dto/documento-personal.dto.js';

const INCLUDE_DOCUMENTO = {
  archivos: {
    include: {
      usuarios_archivos_subido_porTousuarios: {
        select: { id: true, username: true },
      },
    },
  },
} satisfies Prisma.personas_documentosInclude;

type FilaDocumento = Prisma.personas_documentosGetPayload<{
  include: typeof INCLUDE_DOCUMENTO;
}>;

/**
 * Primera mitad de la clave del advisory lock de Postgres; la segunda es el id del
 * funcionario. Serializa las escrituras de documentos de una misma persona.
 */
const LOCK_DOCUMENTOS = 7301;

/** La subida a MinIO corre dentro de la transacción del lock: 10 MB necesitan margen. */
const OPCIONES_TRANSACCION = { timeout: 30_000 };

/// Forma pública. Sin bucket, object_key ni sha256: son detalle interno.
export interface DocumentoPersonal {
  id: bigint;
  descripcion: string | null;
  nombre_original: string;
  content_type: string;
  tamanio_bytes: bigint;
  subido_en: Date;
  subido_por: { id: bigint; username: string } | null;
}

const aDocumento = (fila: FilaDocumento): DocumentoPersonal => ({
  id: fila.id,
  descripcion: fila.descripcion,
  nombre_original: fila.archivos.nombre_original,
  content_type: fila.archivos.content_type,
  tamanio_bytes: fila.archivos.tamanio_bytes,
  subido_en: fila.archivos.subido_en,
  subido_por: fila.archivos.usuarios_archivos_subido_porTousuarios,
});

const comparable = (fila: FilaDocumento) => ({
  fila,
  sha256: fila.archivos.sha256,
  nombre_original: fila.archivos.nombre_original,
  descripcion: fila.descripcion,
});

/**
 * Documentación libre de un funcionario. El objeto lo guarda `ArchivosService`;
 * acá viven el alcance, la descripción y la regla de duplicados.
 */
@Injectable()
export class PersonasDocumentosService {
  private readonly logger = new Logger(PersonasDocumentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: ArchivosService,
  ) {}

  async listar(personaId: number, alcance?: AlcanceResuelto): Promise<DocumentoPersonal[]> {
    await assertPersonaAccesible(this.prisma, BigInt(personaId), alcance);
    const filas = await this.documentosActivos(this.prisma, BigInt(personaId));
    return filas.map(aDocumento);
  }

  async subir(
    personaId: number,
    archivo: Express.Multer.File,
    dto: SubirDocumentoDto,
    usuarioId: bigint,
    alcance?: AlcanceResuelto,
  ): Promise<DocumentoPersonal> {
    const persona = BigInt(personaId);
    await assertPersonaAccesible(this.prisma, persona, alcance);
    const descripcion = dto.descripcion?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      // Sin el lock, dos subidas iguales simultáneas (un doble clic) pasarían las dos.
      await this.bloquearFuncionario(tx, persona);

      const existentes = await this.documentosActivos(tx, persona);
      const duplicado = buscarDuplicado(
        {
          sha256: calcularSha256(archivo.buffer),
          nombre_original: archivo.originalname,
          descripcion,
        },
        existentes.map(comparable),
      );
      if (duplicado) {
        throw new ConflictException({
          message: mensajeDuplicado(duplicado.motivo, duplicado.existente),
          data: {
            motivo: duplicado.motivo,
            existente: aDocumento(duplicado.existente.fila),
          },
        });
      }

      const guardado = await this.archivos.guardar({
        entidad: 'personas',
        entidadId: persona,
        slot: 'documentos',
        nombreOriginal: archivo.originalname,
        buffer: archivo.buffer,
        mimetype: archivo.mimetype,
        usuarioId,
      });

      try {
        const fila = await tx.personas_documentos.create({
          data: { persona_id: persona, archivo_id: guardado.id, descripcion },
          include: INCLUDE_DOCUMENTO,
        });
        return aDocumento(fila);
      } catch (err) {
        // Sin la fila, el archivo queda sin dueño: se da de baja para no dejar huérfanos.
        await this.archivos.eliminar(guardado.id, usuarioId).catch((errBaja) => {
          this.logger.error(
            `Archivo huérfano id=${guardado.id}: no se pudo dar de baja tras fallar el registro`,
            errBaja as Error,
          );
        });
        this.logger.error(`No se pudo registrar el documento del archivo ${guardado.id}`, err as Error);
        throw new InternalServerErrorException('Error al registrar el documento');
      }
    }, OPCIONES_TRANSACCION);
  }

  /** Solo la descripción es editable. Misma regla de duplicados, contra los demás documentos. */
  async actualizar(
    personaId: number,
    documentoId: number,
    dto: ActualizarDocumentoDto,
    alcance?: AlcanceResuelto,
  ): Promise<DocumentoPersonal> {
    const persona = BigInt(personaId);
    const id = BigInt(documentoId);
    await assertPersonaAccesible(this.prisma, persona, alcance);
    const descripcion = dto.descripcion?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      await this.bloquearFuncionario(tx, persona);

      const existentes = await this.documentosActivos(tx, persona);
      if (!existentes.some((fila) => fila.id === id)) {
        throw new NotFoundException('Documento no encontrado');
      }

      if (descripcion !== null) {
        const otros = existentes.filter((fila) => fila.id !== id).map(comparable);
        const repetido = buscarPorDescripcion(descripcion, otros);
        if (repetido) {
          throw new ConflictException({
            message: mensajeDuplicado('descripcion', repetido),
            data: { motivo: 'descripcion', existente: aDocumento(repetido.fila) },
          });
        }
      }

      const fila = await tx.personas_documentos.update({
        where: { id },
        data: { descripcion },
        include: INCLUDE_DOCUMENTO,
      });
      return aDocumento(fila);
    }, OPCIONES_TRANSACCION);
  }

  async obtener(
    personaId: number,
    documentoId: number,
    alcance?: AlcanceResuelto,
  ): Promise<ArchivoConStream> {
    await assertPersonaAccesible(this.prisma, BigInt(personaId), alcance);
    const documento = await this.documentoActivo(personaId, documentoId);
    return this.archivos.obtener(documento.archivo_id);
  }

  /** Para el `HEAD`: los headers salen de la base, sin bajar el objeto de MinIO. */
  async metadatos(
    personaId: number,
    documentoId: number,
    alcance?: AlcanceResuelto,
  ): Promise<MetadatosArchivo> {
    await assertPersonaAccesible(this.prisma, BigInt(personaId), alcance);
    const documento = await this.documentoActivo(personaId, documentoId);
    return {
      nombre_original: documento.archivos.nombre_original,
      content_type: documento.archivos.content_type,
      tamanio_bytes: documento.archivos.tamanio_bytes,
    };
  }

  async eliminar(
    personaId: number,
    documentoId: number,
    usuarioId: bigint,
    alcance?: AlcanceResuelto,
  ): Promise<null> {
    await assertPersonaAccesible(this.prisma, BigInt(personaId), alcance);
    const documento = await this.documentoActivo(personaId, documentoId);
    await this.archivos.eliminar(documento.archivo_id, usuarioId);
    return null;
  }

  private bloquearFuncionario(tx: Prisma.TransactionClient, personaId: bigint) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_DOCUMENTOS}::int, ${personaId}::int)`;
  }

  private documentosActivos(
    cliente: Prisma.TransactionClient,
    personaId: bigint,
  ): Promise<FilaDocumento[]> {
    return cliente.personas_documentos.findMany({
      where: { persona_id: personaId, archivos: { eliminado_en: null } },
      include: INCLUDE_DOCUMENTO,
      orderBy: [{ archivos: { subido_en: 'desc' } }, { id: 'desc' }],
    });
  }

  /** Por id Y funcionario: cambiar el id de la URL no alcanza documentos de otro. */
  private async documentoActivo(personaId: number, documentoId: number) {
    const documento = await this.prisma.personas_documentos.findFirst({
      where: {
        id: BigInt(documentoId),
        persona_id: BigInt(personaId),
        archivos: { eliminado_en: null },
      },
      select: {
        archivo_id: true,
        archivos: { select: { nombre_original: true, content_type: true, tamanio_bytes: true } },
      },
    });
    if (!documento) throw new NotFoundException('Documento no encontrado');
    return documento;
  }
}

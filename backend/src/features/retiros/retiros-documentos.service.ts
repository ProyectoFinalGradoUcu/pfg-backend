import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivoConStream, ArchivosService } from '../archivos/archivos.service';
import type { MetadatosArchivo } from '../archivos/archivos.http';

export const SLOTS_DOCUMENTO_RETIRO = { orden: 'orden', boletin: 'boletin' } as const;
export type SlotDocumentoRetiro = keyof typeof SLOTS_DOCUMENTO_RETIRO;

export interface DocumentoRetiro {
  nombre_original: string;
  content_type: string;
  tamanio_bytes: bigint;
  subido_en: Date;
}

export const SELECT_DOCUMENTO_RETIRO = {
  nombre_original: true,
  content_type: true,
  tamanio_bytes: true,
  subido_en: true,
} as const;

export function aDocumentoRetiro(fila: DocumentoRetiro | null | undefined): DocumentoRetiro | null {
  if (!fila) return null;
  return {
    nombre_original: fila.nombre_original,
    content_type: fila.content_type,
    tamanio_bytes: fila.tamanio_bytes,
    subido_en: fila.subido_en,
  };
}

type ColumnaDocumento = 'archivo_orden_id' | 'archivo_boletin_id';

const COLUMNA: Record<SlotDocumentoRetiro, ColumnaDocumento> = {
  orden: 'archivo_orden_id',
  boletin: 'archivo_boletin_id',
};

const ETIQUETA: Record<SlotDocumentoRetiro, string> = {
  orden: 'orden',
  boletin: 'boletín',
};

@Injectable()
export class RetirosDocumentosService {
  private readonly logger = new Logger(RetirosDocumentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: ArchivosService,
  ) {}

  async subir(
    retiroId: number,
    slot: SlotDocumentoRetiro,
    archivo: Express.Multer.File,
    usuarioId: bigint,
  ): Promise<DocumentoRetiro> {
    const columna = COLUMNA[slot];
    const retiro = await this.cargar(retiroId, slot);
    if (retiro.anulado) {
      throw new ConflictException('El retiro está anulado');
    }
    if (retiro.archivoId !== null) {
      throw new ConflictException(
        `El retiro ya tiene un documento de ${ETIQUETA[slot]}. Quitalo antes de adjuntar otro.`,
      );
    }

    const guardado = await this.archivos.guardar({
      entidad: 'retiros',
      entidadId: BigInt(retiroId),
      slot,
      nombreOriginal: archivo.originalname,
      buffer: archivo.buffer,
      mimetype: archivo.mimetype,
      usuarioId,
    });

    let enganchado: boolean;
    try {
      // Condicionado al slot vacío: de dos subidas simultáneas, solo una queda.
      const { count } = await this.prisma.retiros.updateMany({
        where: { id: BigInt(retiroId), anulado: false, [columna]: null },
        data: { [columna]: guardado.id },
      });
      enganchado = count > 0;
    } catch (err) {
      await this.darDeBaja(guardado.id, usuarioId);
      this.logger.error(`No se pudo registrar el documento del archivo ${guardado.id}`, err as Error);
      throw new InternalServerErrorException('Error al registrar el documento');
    }

    if (!enganchado) {
      await this.darDeBaja(guardado.id, usuarioId);
      throw new ConflictException(
        'El retiro cambió mientras se subía el documento. Volvé a intentar.',
      );
    }

    return aDocumentoRetiro(guardado)!;
  }

  async obtener(retiroId: number, slot: SlotDocumentoRetiro): Promise<ArchivoConStream> {
    const retiro = await this.cargar(retiroId, slot);
    if (retiro.archivoId === null) {
      throw new NotFoundException(`El retiro no tiene documento de ${ETIQUETA[slot]}`);
    }
    return this.archivos.obtener(retiro.archivoId);
  }

  /** Para el `HEAD`: los headers salen de la base, sin bajar el objeto de MinIO. */
  async metadatos(retiroId: number, slot: SlotDocumentoRetiro): Promise<MetadatosArchivo> {
    const retiro = await this.cargar(retiroId, slot);
    if (retiro.archivoId === null) {
      throw new NotFoundException(`El retiro no tiene documento de ${ETIQUETA[slot]}`);
    }
    const archivo = await this.prisma.archivos.findFirst({
      where: { id: retiro.archivoId, eliminado_en: null },
      select: { nombre_original: true, content_type: true, tamanio_bytes: true },
    });
    if (!archivo) {
      throw new NotFoundException('Archivo no encontrado');
    }
    return archivo;
  }

  async quitar(retiroId: number, slot: SlotDocumentoRetiro, usuarioId: bigint): Promise<null> {
    const columna = COLUMNA[slot];
    const retiro = await this.cargar(retiroId, slot);
    if (retiro.anulado) {
      throw new ConflictException('El retiro está anulado');
    }
    if (retiro.archivoId === null) {
      throw new NotFoundException('Documento no encontrado');
    }

    const { count } = await this.prisma.retiros.updateMany({
      where: { id: BigInt(retiroId), [columna]: retiro.archivoId },
      data: { [columna]: null },
    });
    if (count === 0) {
      throw new NotFoundException('Documento no encontrado');
    }

    // El retiro ya quedó sin el documento: si la baja falla, solo queda un objeto huérfano.
    await this.archivos.eliminar(retiro.archivoId, usuarioId).catch((err) => {
      this.logger.error(`Archivo huérfano id=${retiro.archivoId}`, err as Error);
    });
    return null;
  }

  private async cargar(
    retiroId: number,
    slot: SlotDocumentoRetiro,
  ): Promise<{ anulado: boolean; archivoId: bigint | null }> {
    const columna = COLUMNA[slot];
    const fila = await this.prisma.retiros.findUnique({
      where: { id: BigInt(retiroId) },
      select: { anulado: true, [columna]: true },
    });
    if (!fila) {
      throw new NotFoundException('Retiro no encontrado');
    }
    return { anulado: fila.anulado, archivoId: (fila as any)[columna] ?? null };
  }

  private async darDeBaja(archivoId: bigint, usuarioId: bigint): Promise<void> {
    await this.archivos.eliminar(archivoId, usuarioId).catch((err) => {
      this.logger.error(`Archivo huérfano id=${archivoId}`, err as Error);
    });
  }
}

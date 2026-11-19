import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivoConStream, ArchivosService } from './archivos.service';
import type { MetadatosArchivo } from './archivos.http';

export const SLOTS_DOCUMENTO = { orden: 'orden', boletin: 'boletin' } as const;
export type SlotDocumento = keyof typeof SLOTS_DOCUMENTO;

export interface DocumentoRegistro {
  nombre_original: string;
  content_type: string;
  tamanio_bytes: bigint;
  subido_en: Date;
}

export type DocumentosRegistro = Record<
  SlotDocumento,
  DocumentoRegistro | null
>;

export const SELECT_DOCUMENTO = {
  nombre_original: true,
  content_type: true,
  tamanio_bytes: true,
  subido_en: true,
} as const;

export const INCLUDE_DOCUMENTOS = {
  archivo_orden: { select: SELECT_DOCUMENTO },
  archivo_boletin: { select: SELECT_DOCUMENTO },
} as const;

export function aDocumento(
  fila: DocumentoRegistro | null | undefined,
): DocumentoRegistro | null {
  if (!fila) return null;
  return {
    nombre_original: fila.nombre_original,
    content_type: fila.content_type,
    tamanio_bytes: fila.tamanio_bytes,
    subido_en: fila.subido_en,
  };
}

export function documentosDe(fila: {
  archivo_orden?: DocumentoRegistro | null;
  archivo_boletin?: DocumentoRegistro | null;
}): DocumentosRegistro {
  return {
    orden: aDocumento(fila.archivo_orden),
    boletin: aDocumento(fila.archivo_boletin),
  };
}

export const SELECT_ARCHIVOS = {
  archivo_orden_id: true,
  archivo_boletin_id: true,
} as const;

export interface ArchivosFila {
  archivo_orden_id: bigint | null;
  archivo_boletin_id: bigint | null;
}

export function archivosDeFilas(filas: ArchivosFila[]): bigint[] {
  return filas
    .flatMap((fila) => [fila.archivo_orden_id, fila.archivo_boletin_id])
    .filter((id): id is bigint => id != null);
}

// El registro ya no apunta a estos archivos: si una baja falla, solo queda un objeto huérfano.
export async function darDeBajaArchivos(
  archivos: ArchivosService,
  ids: bigint[],
  usuarioId: bigint | null,
  logger: Logger,
): Promise<void> {
  for (const id of ids) {
    await archivos.eliminar(id, usuarioId).catch((err) => {
      logger.error(`Archivo huérfano id=${id}`, err as Error);
    });
  }
}

export type ModeloConDocumentos =
  | 'destinos'
  | 'convocatorias'
  | 'funcionarios_convocatorias'
  | 'ascensos_ordenes'
  | 'funcionarios_cursos';

export interface ConfigDocumentos {
  modelo: ModeloConDocumentos;
  entidad: string;
  articulo: 'El' | 'La';
  nombre: string;
  noEncontrado: string;
  bloqueo?: { campo: string; libre: null | boolean; mensaje: string };
}

type ColumnaDocumento = 'archivo_orden_id' | 'archivo_boletin_id';

const COLUMNA: Record<SlotDocumento, ColumnaDocumento> = {
  orden: 'archivo_orden_id',
  boletin: 'archivo_boletin_id',
};

const ETIQUETA: Record<SlotDocumento, string> = {
  orden: 'orden',
  boletin: 'resolución',
};

interface DelegadoConDocumentos {
  findUnique(args: {
    where: { id: bigint };
    select: Record<string, true>;
  }): Promise<Record<string, unknown> | null>;
  findMany(args: {
    where: { id: { in: bigint[] } };
    select: Record<string, true>;
  }): Promise<Record<string, unknown>[]>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

export class DocumentosDeRegistro {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly archivos: ArchivosService,
    protected readonly config: ConfigDocumentos,
  ) {}

  async subir(
    id: bigint,
    slot: SlotDocumento,
    archivo: Express.Multer.File,
    usuarioId: bigint,
  ): Promise<DocumentoRegistro> {
    const registro = await this.cargar(id, slot);
    this.verificarBloqueo(registro);
    if (registro.archivoId !== null) {
      throw new ConflictException(
        `${this.sujeto} ya tiene un documento de ${ETIQUETA[slot]}. Quitalo antes de adjuntar otro.`,
      );
    }

    const guardado = await this.guardar(id, slot, archivo, usuarioId);
    if (!(await this.enganchar(id, slot, guardado.id, usuarioId))) {
      await this.darDeBaja(guardado.id, usuarioId);
      throw new ConflictException(
        `${this.sujeto} cambió mientras se subía el documento. Volvé a intentar.`,
      );
    }
    return aDocumento(guardado)!;
  }

  async obtener(id: bigint, slot: SlotDocumento): Promise<ArchivoConStream> {
    const archivoId = await this.archivoDelSlot(id, slot);
    return this.archivos.obtener(archivoId);
  }

  /** Para el `HEAD`: los headers salen de la base, sin bajar el objeto de MinIO. */
  async metadatos(id: bigint, slot: SlotDocumento): Promise<MetadatosArchivo> {
    const archivoId = await this.archivoDelSlot(id, slot);
    const archivo = await this.prisma.archivos.findFirst({
      where: { id: archivoId, eliminado_en: null },
      select: {
        nombre_original: true,
        content_type: true,
        tamanio_bytes: true,
      },
    });
    if (!archivo) {
      throw new NotFoundException('Archivo no encontrado');
    }
    return archivo;
  }

  async quitar(
    id: bigint,
    slot: SlotDocumento,
    usuarioId: bigint,
  ): Promise<null> {
    const columna = COLUMNA[slot];
    const registro = await this.cargar(id, slot);
    this.verificarBloqueo(registro);
    if (registro.archivoId === null) {
      throw this.sinDocumento(slot);
    }

    const { count } = await this.delegado.updateMany({
      where: { id, [columna]: registro.archivoId },
      data: { [columna]: null },
    });
    if (count === 0) {
      throw this.sinDocumento(slot);
    }

    await this.darDeBaja(registro.archivoId, usuarioId);
    return null;
  }

  async subirAVarios(
    ids: bigint[],
    slot: SlotDocumento,
    archivo: Express.Multer.File,
    usuarioId: bigint,
  ): Promise<{ adjuntados: number }> {
    const unicos = [...new Set(ids)];
    const existentes = await this.delegado.findMany({
      where: { id: { in: unicos } },
      select: { id: true, [COLUMNA[slot]]: true },
    });
    if (existentes.length !== unicos.length) {
      throw new NotFoundException(this.config.noEncontrado);
    }
    if (existentes.some((fila) => fila[COLUMNA[slot]] != null)) {
      throw new ConflictException(
        `Alguno de los registros ya tiene un documento de ${ETIQUETA[slot]}. Quitalo antes de adjuntar otro.`,
      );
    }

    // Cada registro lleva su propia copia: así quitar el de uno no afecta a los demás.
    let adjuntados = 0;
    for (const id of unicos) {
      const guardado = await this.guardar(id, slot, archivo, usuarioId);
      if (await this.enganchar(id, slot, guardado.id, usuarioId)) {
        adjuntados++;
      } else {
        await this.darDeBaja(guardado.id, usuarioId);
      }
    }
    return { adjuntados };
  }

  private get delegado(): DelegadoConDocumentos {
    return this.prisma[this.config.modelo] as unknown as DelegadoConDocumentos;
  }

  private get sujeto(): string {
    return `${this.config.articulo} ${this.config.nombre}`;
  }

  private async cargar(
    id: bigint,
    slot: SlotDocumento,
  ): Promise<{ bloqueado: boolean; archivoId: bigint | null }> {
    const columna = COLUMNA[slot];
    const bloqueo = this.config.bloqueo;
    const fila = await this.delegado.findUnique({
      where: { id },
      select: {
        id: true,
        [columna]: true,
        ...(bloqueo ? { [bloqueo.campo]: true } : {}),
      },
    });
    if (!fila) {
      throw new NotFoundException(this.config.noEncontrado);
    }
    return {
      bloqueado: bloqueo
        ? (fila[bloqueo.campo] ?? null) !== bloqueo.libre
        : false,
      archivoId: (fila[columna] as bigint | null) ?? null,
    };
  }

  private verificarBloqueo(registro: { bloqueado: boolean }): void {
    if (registro.bloqueado) {
      throw new ConflictException(this.config.bloqueo!.mensaje);
    }
  }

  private async archivoDelSlot(
    id: bigint,
    slot: SlotDocumento,
  ): Promise<bigint> {
    const registro = await this.cargar(id, slot);
    if (registro.archivoId === null) {
      throw this.sinDocumento(slot);
    }
    return registro.archivoId;
  }

  private sinDocumento(slot: SlotDocumento): NotFoundException {
    return new NotFoundException(
      `${this.sujeto} no tiene documento de ${ETIQUETA[slot]}`,
    );
  }

  private guardar(
    id: bigint,
    slot: SlotDocumento,
    archivo: Express.Multer.File,
    usuarioId: bigint,
  ) {
    return this.archivos.guardar({
      entidad: this.config.entidad,
      entidadId: id,
      slot,
      nombreOriginal: archivo.originalname,
      buffer: archivo.buffer,
      mimetype: archivo.mimetype,
      usuarioId,
    });
  }

  private async enganchar(
    id: bigint,
    slot: SlotDocumento,
    archivoId: bigint,
    usuarioId: bigint,
  ): Promise<boolean> {
    const columna = COLUMNA[slot];
    const bloqueo = this.config.bloqueo;
    try {
      // Condicionado al slot vacío: de dos subidas simultáneas, solo una queda.
      const { count } = await this.delegado.updateMany({
        where: {
          id,
          [columna]: null,
          ...(bloqueo ? { [bloqueo.campo]: bloqueo.libre } : {}),
        },
        data: { [columna]: archivoId },
      });
      return count > 0;
    } catch (err) {
      await this.darDeBaja(archivoId, usuarioId);
      this.logger.error(
        `No se pudo registrar el documento del archivo ${archivoId}`,
        err as Error,
      );
      throw new InternalServerErrorException('Error al registrar el documento');
    }
  }

  private darDeBaja(archivoId: bigint, usuarioId: bigint): Promise<void> {
    return darDeBajaArchivos(
      this.archivos,
      [archivoId],
      usuarioId,
      this.logger,
    );
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type * as Minio from 'minio';
import { PrismaService } from '../../lib/prisma.service';
import { construirObjectKey } from './archivos.keys';
import { coincideMagicNumber, TIPOS_PERMITIDOS } from './archivos.mime';

export const MINIO_CLIENT = 'MINIO_CLIENT';
export const TAMANIO_MAXIMO_BYTES = 10 * 1024 * 1024;

export const calcularSha256 = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex');

export interface GuardarArchivoInput {
  entidad: string;
  entidadId: bigint;
  slot: string;
  nombreOriginal: string;
  buffer: Buffer;
  mimetype: string;
  usuarioId: bigint;
}

export interface ArchivoConStream {
  stream: NodeJS.ReadableStream;
  nombre_original: string;
  content_type: string;
  tamanio_bytes: bigint;
}

/// El bucket, la object key y el hash quedan fuera: son detalle interno y
/// exponerlos convertiría la estructura del bucket en contrato público.
export interface ArchivoPublico {
  id: bigint;
  nombre_original: string;
  content_type: string;
  tamanio_bytes: bigint;
  subido_en: Date;
  subido_por: bigint | null;
}

const aPublico = (archivo: {
  id: bigint;
  nombre_original: string;
  content_type: string;
  tamanio_bytes: bigint;
  subido_en: Date;
  subido_por: bigint | null;
}): ArchivoPublico => ({
  id: archivo.id,
  nombre_original: archivo.nombre_original,
  content_type: archivo.content_type,
  tamanio_bytes: archivo.tamanio_bytes,
  subido_en: archivo.subido_en,
  subido_por: archivo.subido_por,
});

@Injectable()
export class ArchivosService implements OnModuleInit {
  private readonly logger = new Logger(ArchivosService.name);
  private readonly bucket: string;

  constructor(
    @Inject(MINIO_CLIENT) private readonly client: Minio.Client,
    @Inject(ConfigService) config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.bucket = config.get<string>('MINIO_BUCKET', 'pfg-documents');
  }

  async onModuleInit() {
    const existe = await this.client.bucketExists(this.bucket);
    if (!existe) {
      await this.client.makeBucket(this.bucket);
    }
    this.logger.log(`Bucket "${this.bucket}" disponible`);
  }

  async guardar(input: GuardarArchivoInput): Promise<ArchivoPublico> {
    if (!TIPOS_PERMITIDOS.includes(input.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido. Solo PDF, JPG o PNG');
    }
    if (input.buffer.length > TAMANIO_MAXIMO_BYTES) {
      throw new BadRequestException('El archivo supera el tamaño máximo de 10 MB');
    }
    if (!coincideMagicNumber(input.buffer, input.mimetype)) {
      throw new BadRequestException(
        'El contenido del archivo no coincide con el tipo declarado',
      );
    }

    const objectKey = construirObjectKey(
      input.entidad,
      input.entidadId,
      input.slot,
      input.nombreOriginal,
    );
    const sha256 = calcularSha256(input.buffer);

    try {
      await this.client.putObject(
        this.bucket,
        objectKey,
        input.buffer,
        input.buffer.length,
        { 'Content-Type': input.mimetype },
      );
    } catch (err) {
      // Sin esto, el mensaje crudo de MinIO (con la IP interna) llega al cliente.
      this.logger.error(`No se pudo subir el objeto ${objectKey}`, err as Error);
      throw new InternalServerErrorException('Error al guardar el archivo');
    }

    try {
      const fila = await this.prisma.archivos.create({
        data: {
          bucket: this.bucket,
          object_key: objectKey,
          nombre_original: input.nombreOriginal,
          content_type: input.mimetype,
          tamanio_bytes: BigInt(input.buffer.length),
          sha256,
          subido_por: input.usuarioId,
        },
      });
      return aPublico(fila);
    } catch (err) {
      await this.client.removeObject(this.bucket, objectKey).catch(() => undefined);
      this.logger.error(`No se pudo registrar el archivo ${objectKey}`, err as Error);
      throw new InternalServerErrorException('Error al registrar el archivo');
    }
  }

  async obtener(id: bigint): Promise<ArchivoConStream> {
    const archivo = await this.prisma.archivos.findFirst({
      where: { id, eliminado_en: null },
    });
    if (!archivo) {
      throw new NotFoundException('Archivo no encontrado');
    }

    try {
      const stream = await this.client.getObject(archivo.bucket, archivo.object_key);
      return {
        stream,
        nombre_original: archivo.nombre_original,
        content_type: archivo.content_type,
        tamanio_bytes: archivo.tamanio_bytes,
      };
    } catch (err: any) {
      if (err?.code === 'NoSuchKey' || err?.code === 'NotFound') {
        throw new NotFoundException('Archivo no encontrado');
      }
      throw new InternalServerErrorException('Error al obtener el archivo');
    }
  }

  async eliminar(id: bigint, usuarioId: bigint): Promise<void> {
    const archivo = await this.prisma.archivos.findFirst({
      where: { id, eliminado_en: null },
    });
    if (!archivo) {
      throw new NotFoundException('Archivo no encontrado');
    }

    // Condicionado a que siga activo: de dos borrados simultáneos, solo uno gana.
    const { count } = await this.prisma.archivos.updateMany({
      where: { id, eliminado_en: null },
      data: { eliminado_en: new Date(), eliminado_por: usuarioId },
    });
    if (count === 0) {
      throw new NotFoundException('Archivo no encontrado');
    }

    await this.client.removeObject(archivo.bucket, archivo.object_key).catch((err) => {
      this.logger.error(`Objeto huérfano: ${archivo.object_key}`, err as Error);
    });
  }
}

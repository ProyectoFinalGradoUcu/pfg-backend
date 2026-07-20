import { Inject, Injectable, InternalServerErrorException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

export interface FileObject {
  stream: NodeJS.ReadableStream;
  contentType: string;
  size: number;
  filename: string;
}

@Injectable()
export class FilesService implements OnModuleInit {
  private client: Minio.Client;
  private bucket: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async onModuleInit() {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'pfg-documents');

    this.client = new Minio.Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10),
      useSSL: this.config.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', ''),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', ''),
    });

    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
      }
    } catch (err) {
      console.warn('[FilesService] No se pudo conectar a MinIO:', err.message);
    }
  }

  async upload(
    folder: string,
    filename: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    const key = `${folder}/${Date.now()}-${filename}`;
    try {
      await this.client.putObject(this.bucket, key, buffer, buffer.length, {
        'Content-Type': mimetype,
      });
      return key;
    } catch {
      throw new InternalServerErrorException('Error al subir el archivo');
    }
  }

  async getObject(key: string): Promise<FileObject> {
    try {
      const stat = await this.client.statObject(this.bucket, key);
      const stream = await this.client.getObject(this.bucket, key);
      return {
        stream,
        contentType: (stat.metaData?.['content-type'] as string) ?? 'application/octet-stream',
        size: stat.size,
        filename: key.split('/').pop() ?? key,
      };
    } catch (err: any) {
      if (err?.code === 'NoSuchKey' || err?.code === 'NotFound') {
        throw new NotFoundException('Archivo no encontrado');
      }
      throw new InternalServerErrorException('Error al obtener el archivo');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
    } catch {
      throw new InternalServerErrorException('Error al eliminar el archivo');
    }
  }
}

import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  FileTypeValidator,
  Injectable,
  MaxFileSizeValidator,
  NestInterceptor,
  ParseFilePipe,
  PayloadTooLargeException,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { Response } from 'express';
import type { Readable } from 'node:stream';
import { catchError, Observable, throwError } from 'rxjs';
import type { ArchivoConStream } from './archivos.service';
import {
  mensajeTamanio,
  RESTRICCIONES_DOCUMENTO,
  type RestriccionesArchivo,
} from './archivos.restricciones';

/**
 * Con `limits.fileSize`, multer corta la subida apenas pasa el límite en vez de cargar el
 * archivo entero en memoria, pero responde 413 con "File too large". Acá se traduce.
 */
@Injectable()
export class LimiteDeTamanioInterceptor implements NestInterceptor {
  constructor(private readonly mensaje = mensajeTamanio(RESTRICCIONES_DOCUMENTO)) {}

  intercept(_contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    return siguiente.handle().pipe(
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof PayloadTooLargeException
            ? new PayloadTooLargeException(this.mensaje)
            : error,
        ),
      ),
    );
  }
}

/** Aplica `nombreOriginalUtf8` en el borde, apenas multer deja el archivo en el request. */
@Injectable()
export class NombreOriginalInterceptor implements NestInterceptor {
  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const req = contexto.switchToHttp().getRequest<{ file?: Express.Multer.File }>();
    if (req.file) req.file.originalname = nombreOriginalUtf8(req.file.originalname);
    return siguiente.handle();
  }
}

/** El orden importa: el traductor envuelve a multer, y la normalización corre después. */
export function SubidaDeArchivo(
  campo = 'archivo',
  camposExtra: Record<string, SchemaObject> = {},
  restricciones: RestriccionesArchivo = RESTRICCIONES_DOCUMENTO,
) {
  return applyDecorators(
    UseInterceptors(
      new LimiteDeTamanioInterceptor(mensajeTamanio(restricciones)),
      FileInterceptor(campo, { limits: { fileSize: restricciones.tamanioMaximoBytes } }),
      NombreOriginalInterceptor,
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: [campo],
        properties: { [campo]: { type: 'string', format: 'binary' }, ...camposExtra },
      },
    }),
  );
}

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

export const validadorDeArchivo = (
  restricciones: RestriccionesArchivo = RESTRICCIONES_DOCUMENTO,
) =>
  new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({
        maxSize: restricciones.tamanioMaximoBytes,
        errorMessage: mensajeTamanio(restricciones),
      }),
      new FileTypeValidator({
        fileType: new RegExp(`^(${restricciones.tipos.map(escaparRegex).join('|')})$`),
        errorMessage: `Tipo de archivo no permitido, o el contenido no coincide con el tipo declarado. Solo ${restricciones.tiposLegibles}`,
      }),
    ],
  });

export type MetadatosArchivo = Pick<
  ArchivoConStream,
  'nombre_original' | 'content_type' | 'tamanio_bytes'
>;

export interface OpcionesDescarga {
  /** `attachment` en vez de `inline`: el navegador baja el archivo en vez de mostrarlo. */
  descarga?: boolean;
  cacheControl?: string;
}

/**
 * RFC 8187 (`filename*`) para el nombre real, más un `filename` ASCII de respaldo para
 * clientes que no lo entienden. `encodeURIComponent` deja pasar `'()*`, que el RFC no admite.
 */
export function contentDisposition(nombre: string, tipo: 'inline' | 'attachment'): string {
  const ascii = nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/gu, '_')
    .replace(/["\\]/g, '_');
  const codificado = encodeURIComponent(nombre).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}

/** Para la descarga y para el `HEAD`, que responde lo mismo sin el cuerpo. */
export function escribirEncabezados(
  res: Response,
  archivo: MetadatosArchivo,
  { descarga = false, cacheControl = 'private, no-store' }: OpcionesDescarga = {},
): void {
  res.setHeader('Content-Type', archivo.content_type);
  res.setHeader('Content-Length', archivo.tamanio_bytes.toString());
  res.setHeader(
    'Content-Disposition',
    contentDisposition(archivo.nombre_original, descarga ? 'attachment' : 'inline'),
  );
  // Por defecto no-store: que los documentos no queden en el caché de disco de una PC compartida.
  res.setHeader('Cache-Control', cacheControl);
}

export function streamArchivo(
  res: Response,
  archivo: ArchivoConStream,
  opciones: OpcionesDescarga = {},
): StreamableFile {
  escribirEncabezados(res, archivo, opciones);
  const stream = archivo.stream as Readable;
  // Si el cliente corta la descarga, se cierra también la conexión con MinIO.
  res.on('close', () => {
    if (!res.writableFinished) stream.destroy();
  });
  return new StreamableFile(stream);
}

/**
 * Multer (busboy sin `defParamCharset`) entrega el nombre del archivo como latin1:
 * un "Cédula.pdf" llega "CÃ©dula.pdf". Se reinterpreta como UTF-8, salvo que ya venga
 * decodificado (algún carácter por encima de U+00FF) o que no sea UTF-8 válido.
 */
export function nombreOriginalUtf8(nombre: string): string {
  if ([...nombre].some((c) => c.charCodeAt(0) > 0xff)) return nombre;
  const decodificado = Buffer.from(nombre, 'latin1').toString('utf8');
  return decodificado.includes(String.fromCharCode(0xfffd)) ? nombre : decodificado;
}

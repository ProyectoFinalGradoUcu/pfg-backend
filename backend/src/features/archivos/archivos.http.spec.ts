import {
  BadRequestException,
  ExecutionContext,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import {
  contentDisposition,
  escribirEncabezados,
  LimiteDeTamanioInterceptor,
  NombreOriginalInterceptor,
  nombreOriginalUtf8,
  streamArchivo,
} from './archivos.http';

const makeRes = () => {
  const headers: Record<string, string> = {};
  const handlers: Record<string, () => void> = {};
  const res = {
    writableFinished: false,
    setHeader: jest.fn((nombre: string, valor: string) => {
      headers[nombre] = valor;
    }),
    on: jest.fn((evento: string, handler: () => void) => {
      handlers[evento] = handler;
    }),
  };
  return { res: res as unknown as Response, raw: res, headers, handlers };
};

const makeArchivo = (overrides: Partial<any> = {}) => ({
  stream: new PassThrough(),
  nombre_original: 'Cédula frente.pdf',
  content_type: 'application/pdf',
  tamanio_bytes: 184223n,
  ...overrides,
});

describe('nombreOriginalUtf8', () => {
  it('reinterpreta como UTF-8 el nombre que multer entrega en latin1', () => {
    expect(nombreOriginalUtf8('CÃ©dula frente.pdf')).toBe('Cédula frente.pdf');
  });

  it('deja igual un nombre ASCII', () => {
    expect(nombreOriginalUtf8('scan0001.pdf')).toBe('scan0001.pdf');
  });

  it('deja igual un nombre que ya viene decodificado', () => {
    expect(nombreOriginalUtf8('Cédula – frente.pdf')).toBe('Cédula – frente.pdf');
  });

  it('deja igual un nombre latin1 genuino que no es UTF-8 válido', () => {
    expect(nombreOriginalUtf8('Cédula.pdf')).toBe('Cédula.pdf');
  });
});

describe('contentDisposition', () => {
  it('manda el nombre en UTF-8 (RFC 8187) y una versión ASCII de respaldo', () => {
    expect(contentDisposition('Cédula frente.pdf', 'inline')).toBe(
      `inline; filename="Cedula frente.pdf"; filename*=UTF-8''C%C3%A9dula%20frente.pdf`,
    );
  });

  it("codifica ' ( ) * que encodeURIComponent deja pasar", () => {
    expect(contentDisposition("D'Angelo (copia)*.pdf", 'attachment')).toBe(
      `attachment; filename="D'Angelo (copia)*.pdf"; filename*=UTF-8''D%27Angelo%20%28copia%29%2A.pdf`,
    );
  });

  it('en el respaldo ASCII cambia por _ lo que no es ASCII imprimible, comillas y barras', () => {
    expect(contentDisposition('Ñandú "2026" 📄\\x.pdf', 'inline')).toBe(
      `inline; filename="Nandu _2026_ __x.pdf"; filename*=UTF-8''%C3%91and%C3%BA%20%222026%22%20%F0%9F%93%84%5Cx.pdf`,
    );
  });
});

describe('escribirEncabezados', () => {
  it('pone tipo, largo, disposición inline y prohíbe el caché', () => {
    const { res, headers } = makeRes();

    escribirEncabezados(res, makeArchivo());

    expect(headers).toEqual({
      'Content-Type': 'application/pdf',
      'Content-Length': '184223',
      'Content-Disposition': `inline; filename="Cedula frente.pdf"; filename*=UTF-8''C%C3%A9dula%20frente.pdf`,
      'Cache-Control': 'private, no-store',
    });
  });

  it('con descarga: true manda attachment', () => {
    const { res, headers } = makeRes();

    escribirEncabezados(res, makeArchivo(), { descarga: true });

    expect(headers['Content-Disposition']).toMatch(/^attachment; /);
  });
});

describe('streamArchivo', () => {
  it('escribe los encabezados y devuelve el stream como StreamableFile', () => {
    const { res, headers } = makeRes();

    const resultado = streamArchivo(res, makeArchivo());

    expect(resultado).toBeInstanceOf(StreamableFile);
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('si el cliente corta antes de terminar, cierra el stream de MinIO', () => {
    const { res, handlers } = makeRes();
    const archivo = makeArchivo();

    streamArchivo(res, archivo);
    handlers.close();

    expect(archivo.stream.destroyed).toBe(true);
  });

  it('si la respuesta terminó bien, no toca el stream', () => {
    const { res, raw, handlers } = makeRes();
    const archivo = makeArchivo();
    const destroy = jest.spyOn(archivo.stream, 'destroy');

    streamArchivo(res, archivo);
    raw.writableFinished = true;
    handlers.close();

    expect(destroy).not.toHaveBeenCalled();
  });
});

describe('LimiteDeTamanioInterceptor', () => {
  const contexto = {} as ExecutionContext;
  const fallaCon = (error: unknown) => ({ handle: () => throwError(() => error) });

  it('traduce el 413 de multer a un mensaje en español, sin cambiar el status', async () => {
    const interceptor = new LimiteDeTamanioInterceptor();

    const error = await lastValueFrom(
      interceptor.intercept(contexto, fallaCon(new PayloadTooLargeException('File too large'))),
    ).catch((e) => e);

    expect(error).toBeInstanceOf(PayloadTooLargeException);
    expect(error.getStatus()).toBe(413);
    expect(error.message).toBe('El archivo supera el tamaño máximo de 10 MB');
  });

  it('deja pasar cualquier otro error tal cual', async () => {
    const interceptor = new LimiteDeTamanioInterceptor();
    const original = new BadRequestException('Unexpected field');

    const error = await lastValueFrom(interceptor.intercept(contexto, fallaCon(original))).catch(
      (e) => e,
    );

    expect(error).toBe(original);
  });
});

describe('NombreOriginalInterceptor', () => {
  const contextoCon = (req: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
  const siguiente = { handle: () => of('ok') };

  it('reinterpreta como UTF-8 el nombre del archivo que dejó multer', () => {
    const req = { file: { originalname: 'CÃ©dula frente.pdf' } };

    new NombreOriginalInterceptor().intercept(contextoCon(req), siguiente);

    expect(req.file.originalname).toBe('Cédula frente.pdf');
  });

  it('sin archivo no hace nada', () => {
    expect(() => new NombreOriginalInterceptor().intercept(contextoCon({}), siguiente)).not.toThrow();
  });
});

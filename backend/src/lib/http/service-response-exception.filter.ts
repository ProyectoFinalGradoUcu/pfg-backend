import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { aJsonPlano } from './json';

const MENSAJE_ERROR_INTERNO = 'Error interno del servidor';

/** http-errors 4xx con `expose`: errores del cliente con un mensaje pensado para mostrarse. */
const esErrorDeClienteExpuesto = (
  exception: unknown,
): exception is Error & { status: number } => {
  const e = exception as { status?: unknown; expose?: unknown };
  return (
    exception instanceof Error &&
    typeof e.status === 'number' &&
    e.status >= 400 &&
    e.status < 500 &&
    e.expose === true
  );
};

@Catch()
export class ServiceResponseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpLogger');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { status, httpMessage } = this.resolverRespuesta(exception);

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    this.logger.error(
      this.buildErrorBox(
        status,
        request?.method ?? 'UNKNOWN',
        request?.originalUrl ?? request?.url ?? '',
        exception instanceof Error ? exception.message : httpMessage,
      ),
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      service_response: {
        service_status: {
          http_status: String(status),
          http_message: httpMessage,
        },
        service_data: this.resolveServiceData(exceptionResponse),
      },
    });
  }

  /**
   * Lo que no es HttpException es un error interno: su mensaje (de Prisma, de MinIO, de
   * un proveedor) puede traer tablas, constraints o IPs, así que va solo al log.
   */
  private resolverRespuesta(exception: unknown): { status: number; httpMessage: string } {
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        httpMessage: this.resolveHttpMessage(exception.getResponse(), exception),
      };
    }
    if (esErrorDeClienteExpuesto(exception)) {
      return { status: exception.status, httpMessage: exception.message };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, httpMessage: MENSAJE_ERROR_INTERNO };
  }

  private resolveHttpMessage(
    exceptionResponse: string | object,
    exception: HttpException,
  ): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    const payload = exceptionResponse as { message?: string | string[] };

    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }

    if (typeof payload.message === 'string') {
      return payload.message;
    }

    return exception.message;
  }

  /**
   * `new XException({ message, data })` manda `data` al cliente en `service_data`.
   * Los BigInt se pasan a string: `response.json()` no los sabe serializar.
   */
  private resolveServiceData(exceptionResponse: string | object | null): unknown {
    if (!exceptionResponse || typeof exceptionResponse !== 'object') return null;

    const { data } = exceptionResponse as { data?: unknown };
    return data === undefined ? null : aJsonPlano(data);
  }

  private buildErrorBox(
    status: number,
    method: string,
    url: string,
    message: string,
  ): string {
    const width = 78;
    const title = `\x1b[31mRESPONSE ERROR\x1b[0m status=${status}`;
    return [
      `\n╔${'═'.repeat(width)}`,
      `║ ${title}`,
      `╟${'─'.repeat(width)}`,
      `║ route  : ${method} ${url}`,
      `║ error  : ${message}`,
      `╚${'═'.repeat(width)}`,
    ].join('\n');
  }
}

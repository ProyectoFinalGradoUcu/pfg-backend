import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class ServiceResponseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpLogger');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const httpMessage = this.resolveHttpMessage(exceptionResponse, exception);

    this.logger.error(
      this.buildErrorBox(
        status,
        request?.method ?? 'UNKNOWN',
        request?.originalUrl ?? request?.url ?? '',
        httpMessage,
      ),
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      service_response: {
        service_status: {
          http_status: String(status),
          http_message: httpMessage,
        },
        service_data: null,
      },
    });
  }

  private resolveHttpMessage(
    exceptionResponse: string | object | null,
    exception: unknown,
  ): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (exceptionResponse && typeof exceptionResponse === 'object') {
      const payload = exceptionResponse as { message?: string | string[] };

      if (Array.isArray(payload.message)) {
        return payload.message.join(', ');
      }

      if (typeof payload.message === 'string') {
        return payload.message;
      }
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Internal Server Error';
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

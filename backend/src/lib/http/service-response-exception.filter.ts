import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ServiceResponseExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const httpMessage = this.resolveHttpMessage(exceptionResponse, exception);

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
}

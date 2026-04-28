import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

const DEFAULT_HTTP_MESSAGES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
};

@Injectable()
export class ServiceResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => ({
        service_response: {
          service_status: {
            http_status: String(response.statusCode),
            http_message:
              DEFAULT_HTTP_MESSAGES[response.statusCode] ?? 'Success',
          },
          service_data: data,
        },
      })),
    );
  }
}

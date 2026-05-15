import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

const DEFAULT_HTTP_MESSAGES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
};

@Injectable()
export class ServiceResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpLogger');
  private readonly maxBodyChars = 1800;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const startTime = Date.now();
    const { method, url, params, query, body } = req;

    this.logger.log(
      this.buildBox({
        title: `${this.cyan('REQUEST')} ${method.padEnd(6)} ${url}`,
        lines: [
          `params : ${this.prettyJson(params)}`,
          `query  : ${this.prettyJson(query)}`,
          `body   : ${this.prettyJson(body)}`,
        ],
      }),
    );

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;

        this.logger.log(
          this.buildBox({
            title: `${this.statusColor(statusCode, 'RESPONSE')} status=${statusCode} duration=${duration}ms`,
            lines: [`body   : ${this.prettyJson(responseBody)}`],
          }),
        );
      }),
      map((data) => ({
        service_response: {
          service_status: {
            http_status: String(res.statusCode),
            http_message:
              DEFAULT_HTTP_MESSAGES[res.statusCode] ?? 'Success',
          },
          service_data: this.normalizeJson(data),
        },
      })),
    );
  }

  private normalizeJson<T>(value: T): T {
    return JSON.parse(this.safeStringify(value)) as T;
  }

  private safeStringify(value: unknown): string {
    return JSON.stringify(value, (_key, currentValue: unknown) =>
      typeof currentValue === 'bigint' ? currentValue.toString() : currentValue,
    );
  }

  private prettyJson(value: unknown): string {
    const text = JSON.stringify(
      value,
      (_key, currentValue: unknown) =>
        typeof currentValue === 'bigint' ? currentValue.toString() : currentValue,
      2,
    );
    if (!text) {
      return 'null';
    }
    if (text.length <= this.maxBodyChars) {
      return text;
    }
    return `${text.slice(0, this.maxBodyChars)}... [truncated ${text.length - this.maxBodyChars} chars]`;
  }

  private buildBox(input: { title: string; lines: string[] }): string {
    const width = 78;
    const hr = '═'.repeat(width);
    const body = input.lines
      .flatMap((line) => line.split('\n'))
      .map((line) => `║ ${line}`)
      .join('\n');
    return `\n╔${hr}\n║ ${input.title}\n╟${'─'.repeat(width)}\n${body}\n╚${hr}`;
  }

  private cyan(text: string): string {
    return `\x1b[36m${text}\x1b[0m`;
  }

  private green(text: string): string {
    return `\x1b[32m${text}\x1b[0m`;
  }

  private yellow(text: string): string {
    return `\x1b[33m${text}\x1b[0m`;
  }

  private red(text: string): string {
    return `\x1b[31m${text}\x1b[0m`;
  }

  private statusColor(status: number, text: string): string {
    if (status >= 500) return this.red(text);
    if (status >= 400) return this.yellow(text);
    return this.green(text);
  }
}

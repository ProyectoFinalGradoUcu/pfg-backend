import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditoriaService } from './auditoria.service';
import { AUDITAR_KEY, AuditarOptions } from './decorators/auditar.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';

/** Solo se auditan operaciones que modifican estado. */
const METODOS_AUDITABLES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Acción inferida del verbo HTTP. Deben existir en la tabla `acciones` (seed). */
const ACCION_POR_METODO: Record<string, string> = {
  POST: 'CREAR',
  PUT: 'ACTUALIZAR',
  PATCH: 'ACTUALIZAR',
  DELETE: 'ELIMINAR',
};

/**
 * Registra automáticamente en la bitácora las operaciones mutantes de cualquier
 * controller marcado con @Auditar. Se ejecuta después de que el handler responde
 * con éxito; si el handler lanza, no se audita.
 *
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opciones = this.reflector.getAllAndOverride<AuditarOptions>(
      AUDITAR_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context
      .switchToHttp()
      .getRequest<
        Request & { user?: AuthenticatedUser; params: Record<string, string> }
      >();

    // Sin metadata, método de solo lectura, o sin usuario autenticado: no se audita.
    if (
      !opciones ||
      !METODOS_AUDITABLES.has(req.method) ||
      !req.user?.id
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const accion = opciones.accion ?? ACCION_POR_METODO[req.method];
        void this.auditoria.registrar({
          usuarioId: req.user!.id,
          accion,
          contexto: opciones.contexto,
          entidad: opciones.entidad ?? null,
          entidadId: this.resolverEntidadId(req.params, responseBody),
          host: this.resolverHost(req),
          detalle: this.construirDetalle(req, responseBody, opciones),
        });
      }),
    );
  }

  /** Prioriza el id de la ruta; si no hay (ej. create), lo busca en la respuesta. */
  private resolverEntidadId(
    params: Record<string, string>,
    responseBody: unknown,
  ): string | null {
    if (params?.id) return params.id;
    return this.extraerIdRespuesta(responseBody);
  }

  private extraerIdRespuesta(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const obj = body as Record<string, unknown>;

    if (obj.id !== undefined && obj.id !== null) return String(obj.id);

    const data = (obj.service_response as Record<string, unknown> | undefined)
      ?.service_data;
    if (data && typeof data === 'object') {
      const id = (data as Record<string, unknown>).id;
      if (id !== undefined && id !== null) return String(id);
    }
    return null;
  }

  private construirDetalle(
    req: Request & { params: Record<string, string> },
    responseBody: unknown,
    opciones: AuditarOptions,
  ): Record<string, unknown> | undefined {
    const detalle: Record<string, unknown> = {};
    if (req.params && Object.keys(req.params).length > 0) {
      detalle.params = req.params;
    }
    if (req.body && typeof req.body === 'object' && Object.keys(req.body as object).length > 0) {
      detalle.body = req.body;
    }
    if (opciones.incluirRespuesta) {
      const resultado = this.desenvolver(responseBody);
      if (resultado && typeof resultado === 'object') detalle.resultado = resultado;
    }
    return Object.keys(detalle).length > 0 ? detalle : undefined;
  }

  private desenvolver(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const sobre = (body as Record<string, unknown>).service_response;
    if (sobre && typeof sobre === 'object') {
      return (sobre as Record<string, unknown>).service_data ?? body;
    }
    return body;
  }

  private resolverHost(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }
}

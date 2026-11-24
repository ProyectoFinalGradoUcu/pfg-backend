import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { from, Observable, of, switchMap, tap } from 'rxjs';
import { AuditoriaService } from './auditoria.service';
import { AUDITAR_KEY, AuditarOptions } from './decorators/auditar.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { AuditoriaFotos, FotoAuditoria } from './auditoria-fotos';
import { AuditoriaNombres, NombresEvento } from './auditoria-nombres';
import { armarResumen } from './auditoria-frases';
import { calcularCambios, sinVacios } from './auditoria-cambios';

/** Solo se auditan operaciones que modifican estado. */
const METODOS_AUDITABLES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Acción inferida del verbo HTTP. Deben existir en la tabla `acciones` (seed). */
const ACCION_POR_METODO: Record<string, string> = {
  POST: 'CREAR',
  PUT: 'ACTUALIZAR',
  PATCH: 'ACTUALIZAR',
  DELETE: 'ELIMINAR',
};

type TipoCambio = 'alta' | 'edicion' | 'baja' | 'otro';

interface Previo {
  foto: FotoAuditoria | null;
  nombres: NombresEvento | null;
}

// Solo ids escalares, un objeto rompe el BigInt
const comoId = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint' ? String(v) : null;

type Req = Request & { user?: AuthenticatedUser; params: Record<string, string> };

// Con foto no se guarda la respuesta cruda
export function limpiarResultado(
  detalle: Record<string, unknown>,
  tipo: TipoCambio,
  fotoAntes: FotoAuditoria | null,
  fotoDespues: FotoAuditoria | null,
): void {
  if (!('resultado' in detalle)) return;
  if ((tipo === 'edicion' || tipo === 'baja') && fotoAntes) delete detalle.resultado;
  else if ((tipo === 'alta' || tipo === 'otro') && fotoDespues) detalle.resultado = sinVacios(fotoDespues.campos);
}

// Anular es baja aunque venga por POST, activar y desactivar son ediciones
export function tipoDeCambio(metodo: string, accion: string): TipoCambio {
  if (accion === 'ASIGNAR') return 'otro';
  if (metodo === 'DELETE' || accion === 'DESASIGNAR' || /anular/i.test(accion)) return 'baja';
  if (metodo === 'PUT' || metodo === 'PATCH' || accion === 'ACTUALIZAR' || /activar/i.test(accion)) return 'edicion';
  if (metodo === 'POST' && accion === 'CREAR') return 'alta';
  return 'otro';
}

/**
 * Registra automáticamente en la bitácora las operaciones mutantes de cualquier
 * controller marcado con @Auditar. Se ejecuta después de que el handler responde
 * con éxito; si el handler lanza, no se audita.
 *
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditoriaInterceptor.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
    private readonly fotos: AuditoriaFotos,
    private readonly nombres: AuditoriaNombres,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opciones = this.reflector.getAllAndOverride<AuditarOptions>(
      AUDITAR_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context
      .switchToHttp()
      .getRequest<Req>();

    // Sin metadata, registro a cargo del service, método de solo lectura, o sin
    // usuario autenticado: no se audita acá.
    if (
      !opciones ||
      opciones.registroManual ||
      !METODOS_AUDITABLES.has(req.method) ||
      !req.user?.id
    ) {
      return next.handle();
    }

    const accion = opciones.accion ?? ACCION_POR_METODO[req.method];
    const tipo = tipoDeCambio(req.method, accion);
    // Se lee antes solo si el registro cambia o se borra
    const necesitaPrevio = (!!opciones.foto && (tipo === 'edicion' || tipo === 'baja')) || tipo === 'baja';
    const previo$ = necesitaPrevio
      ? from(this.cargarPrevio(req, opciones, tipo))
      : of<Previo>({ foto: null, nombres: null });

    return previo$.pipe(
      switchMap((previo) =>
        next.handle().pipe(
          tap((responseBody: unknown) => {
            // Si falla la auditoría solo se loguea
            this.registrarEvento(req, opciones, accion, tipo, previo, responseBody).catch((error: unknown) => {
              const mensaje = error instanceof Error ? error.message : String(error);
              this.logger.error(`Auditoría: no se pudo registrar el evento: ${mensaje}`);
            });
          }),
        ),
      ),
    );
  }

  private async cargarPrevio(req: Req, opciones: AuditarOptions, tipo: TipoCambio): Promise<Previo> {
    try {
      const foto = opciones.foto
        ? await this.fotos.cargar(opciones.foto, req.params?.[opciones.idParam ?? 'id'], req.params ?? {})
        : null;
      // En una baja los nombres se buscan antes de borrar
      const nombres =
        tipo === 'baja'
          ? (await this.nombres.resolver([
              { entidad: opciones.entidad ?? null, entidadId: req.params?.id ?? null, detalle: { params: req.params } },
            ]))[0]
          : null;
      return { foto, nombres };
    } catch (error) {
      this.avisar('leer el estado anterior', error);
      return { foto: null, nombres: null };
    }
  }

  private async registrarEvento(
    req: Req,
    opciones: AuditarOptions,
    accion: string,
    tipo: TipoCambio,
    previo: Previo,
    responseBody: unknown,
  ): Promise<void> {
    const entidadId = this.resolverEntidadId(req.params, responseBody);
    const detalle = this.construirDetalle(req, responseBody, opciones) ?? {};
    try {
      await this.enriquecer(detalle, req, opciones, accion, tipo, previo, responseBody, entidadId);
    } catch (error) {
      this.avisar('armar la descripción', error);
    }
    await this.auditoria.registrar({
      usuarioId: req.user!.id,
      accion,
      contexto: opciones.contexto,
      entidad: opciones.entidad ?? null,
      entidadId,
      host: this.resolverHost(req),
      detalle: Object.keys(detalle).length > 0 ? detalle : undefined,
    });
  }

  // Agrega descripción, cambios y foto al detalle
  private async enriquecer(
    detalle: Record<string, unknown>,
    req: Req,
    opciones: AuditarOptions,
    accion: string,
    tipo: TipoCambio,
    previo: Previo,
    responseBody: unknown,
    entidadId: string | null,
  ): Promise<void> {
    let fotoDespues: FotoAuditoria | null = null;
    if (opciones.foto && tipo !== 'baja') {
      // Si la ruta no trae el id sale de la respuesta
      const id = req.params?.[opciones.idParam ?? 'id'] ?? (tipo === 'edicion' ? null : this.extraerIdRespuesta(responseBody));
      fotoDespues = await this.fotos.cargar(opciones.foto, id, req.params ?? {});
    }
    if (tipo === 'edicion' && previo.foto && fotoDespues) {
      const cambios = calcularCambios(previo.foto.campos, fotoDespues.campos);
      if (cambios.length > 0) detalle.cambios = cambios;
    }
    if (tipo === 'baja' && previo.foto) detalle.anterior = sinVacios(previo.foto.campos);

    const despues = (
      await this.nombres.resolver([{ entidad: opciones.entidad ?? null, entidadId, detalle }])
    )[0];
    const nombres = { ...(previo.nombres?.nombres ?? {}), ...despues.nombres };
    const entidadNombre =
      fotoDespues?.nombre ?? previo.foto?.nombre ?? despues.entidadNombre ?? previo.nombres?.entidadNombre ?? null;
    const descripcion = armarResumen({
      accion,
      entidad: opciones.entidad ?? null,
      entidadNombre,
      detalle,
      nombres,
    });
    if (descripcion) detalle.descripcion = descripcion;
    limpiarResultado(detalle, tipo, previo.foto, fotoDespues);
  }

  private avisar(que: string, error: unknown) {
    const mensaje = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Auditoría: no se pudo ${que}, se registra sin eso: ${mensaje}`);
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

    const directo = comoId(obj.id);
    if (directo) return directo;

    const data = (obj.service_response as Record<string, unknown> | undefined)
      ?.service_data;
    if (data && typeof data === 'object') return comoId((data as Record<string, unknown>).id);
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

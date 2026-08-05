import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service';
import { APLICACION } from '../../lib/aplicacion.const';
import { CAMPOS_SENSIBLES } from './auditoria.constants';
import { ListAuditoriaQueryDto } from './dto/list-auditoria-query.dto';

export interface RegistrarAuditoriaInput {
  usuarioId: string | bigint;
  accion: string;
  contexto: string;
  entidad?: string | null;
  entidadId?: string | bigint | number | null;
  detalle?: unknown;
  host?: string | null;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  /**
   * Cachés en memoria nombre -> id para no golpear la BD en cada evento.
   * `acciones` y `contextos` son catálogos chicos y estables, compartidos entre
   * aplicaciones, así que cachearlos es seguro.
   */
  private readonly accionesCache = new Map<string, bigint>();
  private readonly contextosCache = new Map<string, bigint>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un evento de auditoría. 
   * Si hay error logea para que no tire excepción y rompa la operación principal.
   */
  async registrar(entry: RegistrarAuditoriaInput): Promise<void> {
    try {
      const [accionId, contextoId] = await Promise.all([
        this.resolverAccion(entry.accion),
        this.resolverContexto(entry.contexto),
      ]);

      if (accionId === null) {
        this.logger.error(
          `AUDITORÍA NO REGISTRADA: la acción "${entry.accion}" no existe en la tabla 'acciones'. ` +
            `Agregala por seed/migración. (contexto=${entry.contexto})`,
        );
        return;
      }
      if (contextoId === null) {
        this.logger.error(
          `AUDITORÍA NO REGISTRADA: el contexto "${entry.contexto}" no existe en la tabla 'contextos'. ` +
            `Agregalo por seed/migración. (accion=${entry.accion})`,
        );
        return;
      }

      await this.prisma.bitacora_auditoria.create({
        data: {
          usuario_id: BigInt(entry.usuarioId),
          accion_id: accionId,
          contexto_id: contextoId,
          host: entry.host?.slice(0, 100) ?? null,
          entidad: entry.entidad?.slice(0, 60) ?? null,
          entidad_id:
            entry.entidadId === null || entry.entidadId === undefined
              ? null
              : BigInt(entry.entidadId),
          detalle: this.sanitizar(entry.detalle),
          aplicacion: APLICACION,
        },
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo registrar auditoría (accion=${entry.accion}, contexto=${entry.contexto}): ${mensaje}`,
      );
    }
  }

  /** Lista la bitácora con filtros y paginado, ordenada de más reciente a más antigua. */
  async listar(query: ListAuditoriaQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const where: Prisma.bitacora_auditoriaWhereInput = {
      aplicacion: APLICACION,
      ...(query.usuarioId ? { usuario_id: BigInt(query.usuarioId) } : {}),
      ...(query.accion ? { acciones: { nombre: query.accion } } : {}),
      ...(query.contexto ? { contextos: { nombre: query.contexto } } : {}),
      ...(query.entidad ? { entidad: query.entidad } : {}),
      ...(query.entidadId ? { entidad_id: BigInt(query.entidadId) } : {}),
      ...this.filtroFechas(query.desde, query.hasta),
    };

    const [total, registros] = await this.prisma.$transaction([
      this.prisma.bitacora_auditoria.count({ where }),
      this.prisma.bitacora_auditoria.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          acciones: { select: { nombre: true } },
          contextos: { select: { nombre: true } },
          usuarios: { select: { id: true, username: true } },
        },
      }),
    ]);

    return {
      items: registros.map((r) => ({
        id: r.id.toString(),
        fecha: r.fecha,
        accion: r.acciones.nombre,
        contexto: r.contextos.nombre,
        entidad: r.entidad,
        entidadId: r.entidad_id?.toString() ?? null,
        host: r.host,
        detalle: r.detalle,
        usuario: {
          id: r.usuarios.id.toString(),
          username: r.usuarios.username,
        },
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Devuelve los valores disponibles de acción y contexto para poblar filtros en el frontend. */
  async filtros() {
    const [acciones, contextos] = await Promise.all([
      this.prisma.acciones.findMany({
        orderBy: { nombre: 'asc' },
        select: { id: true, nombre: true },
      }),
      this.prisma.contextos.findMany({
        orderBy: { nombre: 'asc' },
        select: { id: true, nombre: true },
      }),
    ]);

    return {
      acciones: acciones.map((a) => ({ id: a.id.toString(), nombre: a.nombre })),
      contextos: contextos.map((c) => ({ id: c.id.toString(), nombre: c.nombre })),
    };
  }

  private filtroFechas(
    desde?: string,
    hasta?: string,
  ): Prisma.bitacora_auditoriaWhereInput {
    const fecha: Prisma.DateTimeFilter = {};
    if (desde) {
      const d = new Date(desde);
      if (!Number.isNaN(d.getTime())) fecha.gte = d;
    }
    if (hasta) {
      const h = new Date(hasta);
      if (!Number.isNaN(h.getTime())) {
        // Si viene solo la fecha (sin hora), incluir todo el día.
        if (!hasta.includes('T')) h.setHours(23, 59, 59, 999);
        fecha.lte = h;
      }
    }
    return Object.keys(fecha).length > 0 ? { fecha } : {};
  }

  private async resolverAccion(nombre: string): Promise<bigint | null> {
    return this.resolver(nombre, this.accionesCache, (n) =>
      this.prisma.acciones.findUnique({
        where: { nombre: n },
        select: { id: true },
      }),
    );
  }

  private async resolverContexto(nombre: string): Promise<bigint | null> {
    return this.resolver(nombre, this.contextosCache, (n) =>
      this.prisma.contextos.findUnique({
        where: { nombre: n },
        select: { id: true },
      }),
    );
  }

  /**
   * Resuelve nombre -> id contra la BD (fuente de verdad). Devuelve null si no
   * existe: no se crea nada. Los no-existentes no se cachean, para que un alta
   * posterior por seed/migración quede disponible sin reiniciar.
   */
  private async resolver(
    nombre: string,
    cache: Map<string, bigint>,
    find: (nombre: string) => Promise<{ id: bigint } | null>,
  ): Promise<bigint | null> {
    const clave = nombre.trim();
    const cacheado = cache.get(clave);
    if (cacheado !== undefined) return cacheado;

    const row = await find(clave);
    if (!row) return null;

    cache.set(clave, row.id);
    return row.id;
  }

  /**
   * Devuelve una copia JSON-safe del detalle, ocultando campos sensibles y
   * convirtiendo BigInt a string. Retorna `undefined` si no hay detalle útil.
   */
  private sanitizar(detalle: unknown): Prisma.InputJsonValue | undefined {
    if (detalle === null || detalle === undefined) return undefined;

    const limpio = this.limpiar(detalle);
    if (
      limpio === null ||
      limpio === undefined ||
      (typeof limpio === 'object' && Object.keys(limpio).length === 0)
    ) {
      return undefined;
    }
    return limpio as Prisma.InputJsonValue;
  }

  private limpiar(valor: unknown): unknown {
    if (typeof valor === 'bigint') return valor.toString();
    if (valor instanceof Date) return valor.toISOString();
    if (Array.isArray(valor)) return valor.map((v) => this.limpiar(v));
    if (valor !== null && typeof valor === 'object') {
      const salida: Record<string, unknown> = {};
      for (const [clave, val] of Object.entries(valor)) {
        if (CAMPOS_SENSIBLES.includes(clave)) {
          salida[clave] = '***';
          continue;
        }
        salida[clave] = this.limpiar(val);
      }
      return salida;
    }
    return valor;
  }
}

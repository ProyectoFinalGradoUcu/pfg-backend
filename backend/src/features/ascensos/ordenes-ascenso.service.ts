import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { AscensoRegistroService } from './ascenso-registro.service.js';
import { ElegibilidadService } from './elegibilidad.service.js';
import { CreateOrdenDto } from './dto/create-orden.dto.js';
import { ListOrdenesQueryDto } from './dto/list-ordenes-query.dto.js';
import { ResultadoElegibilidad } from './elegibilidad.evaluador.js';

const soloFecha = (fecha: Date | null | undefined) =>
  fecha ? fecha.toISOString().split('T')[0] : null;

const includeAscenso = {
  personas: {
    select: { id: true, cedula: true, primer_nombre: true, primer_apellido: true },
  },
  grados: { select: { id: true, codigo: true, denominacion: true } },
  grados_grado_anterior: { select: { id: true, codigo: true, denominacion: true } },
  ascensos_reglas: { select: { id: true, nombre: true } },
  usuario_registro: { select: { id: true, username: true } },
  usuario_anulacion: { select: { id: true, username: true } },
} satisfies Prisma.ascensosInclude;

type AscensoConTodo = Prisma.ascensosGetPayload<{ include: typeof includeAscenso }>;

/**
 * La orden administrativa es la unidad de trabajo: alcanza a varios
 * funcionarios y se registra, consulta y anula como un todo. El alta evalúa a
 * cada uno a la fecha de su ascenso, guarda esa evaluación y delega la
 * escritura en `AscensoRegistroService`, en una sola transacción.
 */
@Injectable()
export class OrdenesAscensoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registro: AscensoRegistroService,
    private readonly elegibilidad: ElegibilidadService,
  ) {}

  // ─── Alta ─────────────────────────────────────────────────────────────────

  async crear(
    dto: CreateOrdenDto,
    usuarioId: bigint | null,
    permisos: string[] = [],
  ) {
    // La orden se identifica por el N.º de O.C.G.F.A. o por el boletín: al menos uno.
    if (!dto.numero_orden && !dto.boletin) {
      throw new BadRequestException('Se requiere al menos número de orden o boletín');
    }

    const personaIds = dto.funcionarios.map((f) => f.persona_id);
    const repetidos = personaIds.filter((id, i) => personaIds.indexOf(id) !== i);
    if (repetidos.length > 0) {
      throw new BadRequestException(
        `Hay funcionarios repetidos en la orden: ${[...new Set(repetidos)].join(', ')}`,
      );
    }

    // Antes de la transacción: es solo lectura.
    const evaluaciones = await this.evaluarFuncionarios(dto);

    const puedeExcepcion = permisos.includes('ascensos.excepcion');
    const preparados = dto.funcionarios.map((f) => {
      const evaluacion = evaluaciones.get(String(f.persona_id)) ?? null;
      const gradoDestinoId =
        f.grado_destino_id ??
        (evaluacion?.grado_destino ? Number(evaluacion.grado_destino.id) : null);

      if (!gradoDestinoId) {
        throw new BadRequestException(
          `No se sabe a qué grado asciende el funcionario ${f.persona_id}: su grado no tiene regla vigente y no se indicó un grado destino.`,
        );
      }

      // Sin regla evaluable no se puede afirmar que cumplía ni que no cumplía.
      const cumplia = evaluacion?.regla ? evaluacion.estado === 'PASIBLE' : null;

      if (cumplia === false) {
        if (!f.motivo_excepcion?.trim()) {
          throw new BadRequestException(
            `${evaluacion?.persona.nombre_completo ?? `El funcionario ${f.persona_id}`} no cumple los requisitos (${evaluacion?.motivo ?? 'sin detalle'}). Para ascenderlo igual hay que escribir un motivo de excepción.`,
          );
        }
        if (!puedeExcepcion) {
          throw new ForbiddenException(
            `${evaluacion?.persona.nombre_completo ?? `El funcionario ${f.persona_id}`} no cumple los requisitos y no tenés el permiso para registrar un ascenso por excepción.`,
          );
        }
      }

      return {
        persona_id: BigInt(f.persona_id),
        grado_destino_id: BigInt(gradoDestinoId),
        fecha_ascenso: new Date(f.fecha_ascenso ?? dto.fecha_orden),
        regla_id: evaluacion?.regla ? BigInt(evaluacion.regla.id) : null,
        cumplia_requisitos: cumplia,
        evaluacion: (evaluacion as unknown as Prisma.InputJsonValue) ?? null,
        motivo_excepcion: cumplia === false ? (f.motivo_excepcion ?? null) : null,
      };
    });

    const orden = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.ascensos_ordenes.create({
        data: {
          numero_orden: dto.numero_orden ?? null,
          fecha_orden: new Date(dto.fecha_orden),
          boletin: dto.boletin ?? null,
          observaciones: dto.observaciones ?? null,
          creada_por: usuarioId,
        },
      });

      for (const p of preparados) {
        await this.registro.registrarEnTransaccion(tx, {
          persona_id: p.persona_id,
          grado_destino_id: p.grado_destino_id,
          fecha_ascenso: p.fecha_ascenso,
          orden_ascenso_id: creada.id,
          numero_orden: dto.numero_orden ?? null,
          observaciones: dto.observaciones ?? null,
          regla_id: p.regla_id,
          cumplia_requisitos: p.cumplia_requisitos,
          evaluacion: p.evaluacion,
          motivo_excepcion: p.motivo_excepcion,
          usuario_id: usuarioId,
        });
      }

      return creada;
    });

    return this.obtener(Number(orden.id));
  }

  /** Agrupados por fecha de ascenso, que es de lo que depende la evaluación. */
  private async evaluarFuncionarios(dto: CreateOrdenDto) {
    const porFecha = new Map<string, number[]>();
    for (const f of dto.funcionarios) {
      const fecha = f.fecha_ascenso ?? dto.fecha_orden;
      porFecha.set(fecha, [...(porFecha.get(fecha) ?? []), f.persona_id]);
    }

    const evaluaciones = new Map<string, ResultadoElegibilidad>();
    for (const [fecha, ids] of porFecha) {
      const lote = await this.elegibilidad.evaluarVarios(ids, fecha);
      for (const [personaId, resultado] of lote) evaluaciones.set(personaId, resultado);
    }
    return evaluaciones;
  }

  // ─── Consulta ─────────────────────────────────────────────────────────────

  async listar(query: ListOrdenesQueryDto = {}, alcance?: AlcanceResuelto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);

    const where: Prisma.ascensos_ordenesWhereInput = {};

    // Por defecto el año en curso; una orden vieja se busca con el filtro.
    const desde = query.desde
      ? new Date(query.desde)
      : new Date(Date.UTC(query.anio ?? new Date().getUTCFullYear(), 0, 1));
    const hasta = query.hasta
      ? new Date(query.hasta)
      : new Date(Date.UTC((query.anio ?? new Date().getUTCFullYear()) + 1, 0, 1));
    where.fecha_orden = { gte: desde, lt: hasta };

    if (query.numero_orden) {
      where.numero_orden = { contains: query.numero_orden, mode: 'insensitive' };
    }
    if (query.anuladas === true) where.anulada_en = { not: null };
    if (query.anuladas === false) where.anulada_en = null;
    if (query.registrado_por) where.creada_por = BigInt(query.registrado_por);

    const filtroAscensos: Prisma.ascensosWhereInput = {};
    if (query.grado_destino_id) filtroAscensos.grado_id = BigInt(query.grado_destino_id);
    if (query.con_excepciones) filtroAscensos.cumplia_requisitos = false;
    if (query.unidad_id || alcance?.tipo === 'unidad') {
      const unidades = query.unidad_id
        ? [BigInt(query.unidad_id)]
        : (alcance as { unidadIds: string[] }).unidadIds.map((u) => BigInt(u));
      filtroAscensos.relacion_laboral_nueva = { unidad_id: { in: unidades } };
    }
    if (Object.keys(filtroAscensos).length > 0) {
      where.ascensos = { some: filtroAscensos };
    }

    const [total, ordenes] = await this.prisma.$transaction([
      this.prisma.ascensos_ordenes.count({ where }),
      this.prisma.ascensos_ordenes.findMany({
        where,
        orderBy: [{ fecha_orden: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          usuario_creacion: { select: { id: true, username: true } },
          usuario_anulacion: { select: { id: true, username: true } },
          ascensos: { include: includeAscenso },
        },
      }),
    ]);

    const delPeriodo = await this.prisma.ascensos_ordenes.findMany({
      where: { fecha_orden: { gte: desde, lt: hasta } },
      select: {
        anulada_en: true,
        ascensos: { select: { anulado_en: true, cumplia_requisitos: true } },
      },
    });

    const ascensosDelPeriodo = delPeriodo.flatMap((o) => o.ascensos);

    return {
      items: ordenes.map((o) => this.mapOrden(o)),
      total,
      page,
      pageSize,
      stats: {
        ordenes: delPeriodo.length,
        ordenes_anuladas: delPeriodo.filter((o) => o.anulada_en != null).length,
        ascensos: ascensosDelPeriodo.filter((a) => a.anulado_en == null).length,
        ascensos_anulados: ascensosDelPeriodo.filter((a) => a.anulado_en != null).length,
        por_excepcion: ascensosDelPeriodo.filter((a) => a.cumplia_requisitos === false).length,
      },
    };
  }

  async obtener(id: number) {
    const orden = await this.prisma.ascensos_ordenes.findUnique({
      where: { id: BigInt(id) },
      include: {
        usuario_creacion: { select: { id: true, username: true } },
        usuario_anulacion: { select: { id: true, username: true } },
        ascensos: { include: includeAscenso, orderBy: { id: 'asc' } },
      },
    });
    if (!orden) throw new NotFoundException(`No existe la orden de ascenso ${id}`);
    return this.mapOrden(orden, true);
  }

  // ─── Anulación ────────────────────────────────────────────────────────────

  /**
   * Todo o nada: si alguno de sus ascensos ya no se puede revertir, no se anula
   * ninguno y el error dice cuál traba.
   */
  async anularOrden(id: number, motivo: string, usuarioId: bigint | null) {
    const orden = await this.prisma.ascensos_ordenes.findUnique({
      where: { id: BigInt(id) },
      include: { ascensos: { select: { id: true, anulado_en: true } } },
    });
    if (!orden) throw new NotFoundException(`No existe la orden de ascenso ${id}`);
    if (orden.anulada_en) {
      throw new ConflictException(
        `La orden ${orden.numero_orden ?? orden.boletin} ya está anulada`,
      );
    }

    const vigentes = orden.ascensos.filter((a) => a.anulado_en == null);

    await this.prisma.$transaction(async (tx) => {
      // En orden inverso al alta.
      for (const ascenso of [...vigentes].reverse()) {
        await this.registro.anularEnTransaccion(tx, ascenso.id, {
          motivo,
          usuario_id: usuarioId,
        });
      }

      await tx.ascensos_ordenes.update({
        where: { id: orden.id },
        data: {
          anulada_en: new Date(),
          anulada_por: usuarioId,
          motivo_anulacion: motivo,
        },
      });
    });

    return this.obtener(id);
  }

  /** Anula un ascenso puntual, sin tocar el resto de la orden. */
  async anularAscenso(ascensoId: number, motivo: string, usuarioId: bigint | null) {
    const ascenso = await this.registro.anular(BigInt(ascensoId), {
      motivo,
      usuario_id: usuarioId,
    });

    return ascenso.orden_ascenso_id
      ? this.obtener(Number(ascenso.orden_ascenso_id))
      : this.mapAscenso(
          (await this.prisma.ascensos.findUnique({
            where: { id: ascenso.id },
            include: includeAscenso,
          }))!,
          true,
        );
  }

  // ─── Mapeo ────────────────────────────────────────────────────────────────

  private mapOrden(
    orden: {
      id: bigint;
      numero_orden: string | null;
      fecha_orden: Date;
      boletin: string | null;
      observaciones: string | null;
      anulada_en: Date | null;
      motivo_anulacion: string | null;
      creada_en: Date;
      usuario_creacion: { id: bigint; username: string } | null;
      usuario_anulacion: { id: bigint; username: string } | null;
      ascensos: AscensoConTodo[];
    },
    conEvaluacion = false,
  ) {
    const vigentes = orden.ascensos.filter((a) => a.anulado_en == null);
    return {
      id: orden.id,
      numero_orden: orden.numero_orden,
      fecha_orden: soloFecha(orden.fecha_orden),
      boletin: orden.boletin,
      observaciones: orden.observaciones,
      anulada: orden.anulada_en != null,
      anulada_en: orden.anulada_en,
      motivo_anulacion: orden.motivo_anulacion,
      creada_en: orden.creada_en,
      creada_por: orden.usuario_creacion,
      anulada_por: orden.usuario_anulacion,
      cantidad_funcionarios: orden.ascensos.length,
      cantidad_vigentes: vigentes.length,
      cantidad_por_excepcion: orden.ascensos.filter((a) => a.cumplia_requisitos === false).length,
      ascensos: orden.ascensos.map((a) => this.mapAscenso(a, conEvaluacion)),
    };
  }

  private mapAscenso(ascenso: AscensoConTodo, conEvaluacion = false) {
    return {
      id: ascenso.id,
      persona: ascenso.personas
        ? {
            id: ascenso.personas.id,
            cedula: ascenso.personas.cedula,
            nombre_completo:
              `${ascenso.personas.primer_nombre} ${ascenso.personas.primer_apellido}`.trim(),
          }
        : null,
      grado_anterior: ascenso.grados_grado_anterior,
      grado_nuevo: ascenso.grados,
      fecha_ascenso: soloFecha(ascenso.fecha_ascenso),
      numero_orden: ascenso.numero_orden,
      regla: ascenso.ascensos_reglas,
      cumplia_requisitos: ascenso.cumplia_requisitos,
      por_excepcion: ascenso.cumplia_requisitos === false,
      motivo_excepcion: ascenso.motivo_excepcion,
      anulado: ascenso.anulado_en != null,
      anulado_en: ascenso.anulado_en,
      motivo_anulacion: ascenso.motivo_anulacion,
      registrado_por: ascenso.usuario_registro,
      anulado_por: ascenso.usuario_anulacion,
      // Solo en el detalle: en el listado sería un JSON grande por fila.
      ...(conEvaluacion ? { evaluacion: ascenso.evaluacion } : {}),
    };
  }
}

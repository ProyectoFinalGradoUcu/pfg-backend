import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import {
  AlcanceResuelto,
  unidadIdsDeAlcance,
} from '../../lib/alcance/alcance.types.js';
import {
  AscensoRegistroService,
  mensajeFueraDeCarrera,
} from './ascenso-registro.service.js';
import { clasificarAscenso } from './ascensos.constants.js';
import { ElegibilidadService } from './elegibilidad.service.js';
import { CreateOrdenDto } from './dto/create-orden.dto.js';
import { ListOrdenesQueryDto } from './dto/list-ordenes-query.dto.js';
import { DetalleOrdenQueryDto } from './dto/detalle-orden-query.dto.js';
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
    alcance?: AlcanceResuelto,
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

    // Antes de la transacción: es solo lectura. La relación que se ve acá es la
    // que cada registro espera encontrar después de tomar el lock.
    const [evaluaciones, vigentes, catalogo] = await Promise.all([
      this.evaluarFuncionarios(dto),
      this.relacionesVigentes(personaIds),
      this.prisma.grados.findMany({ select: { id: true, codigo: true, denominacion: true } }),
    ]);
    const grados = new Map(catalogo.map((g) => [g.id.toString(), g]));

    const puedeExcepcion = permisos.includes('ascensos.excepcion');

    const eligePosicion = dto.funcionarios.some(
      (f) => f.posicion_derecha != null || f.posicion_numor != null,
    );
    if (eligePosicion && !permisos.includes('derecha.gestionar')) {
      throw new ForbiddenException(
        'No tenés el permiso para elegir la posición en la derecha o el numor: sin él, los ascendidos van al final de su grado.',
      );
    }
    // Todo ascenso pasa por la evaluación de elegibilidad. El motor deja afuera
    // a los civiles (no ascienden por la escala militar) y a quien no tiene
    // relación vigente: a ninguno de los dos se le puede registrar un ascenso.
    const personas = new Map(
      (
        await this.prisma.personas.findMany({
          where: { id: { in: personaIds.map((id) => BigInt(id)) } },
          select: { id: true, es_civil: true, primer_nombre: true, primer_apellido: true },
        })
      ).map((p) => [p.id.toString(), p]),
    );
    const unidadesDelUsuario = alcance ? unidadIdsDeAlcance(alcance) : null;
    for (const f of dto.funcionarios) {
      const clave = String(f.persona_id);
      const persona = personas.get(clave);
      const unidad = vigentes.get(clave)?.unidad_id ?? null;
      // Fuera del alcance responde igual que si no existiera: un 403 confirmaría
      // que la persona está en otra unidad (spec 002 §7).
      const fueraDeAlcance =
        unidadesDelUsuario !== null &&
        (unidad === null || !unidadesDelUsuario.includes(unidad));
      if (!persona || fueraDeAlcance) {
        throw new NotFoundException(`No existe el funcionario ${f.persona_id}`);
      }
      const nombre = `${persona.primer_nombre} ${persona.primer_apellido}`.trim();
      if (persona.es_civil) {
        throw new BadRequestException(
          `${nombre} es personal civil: los civiles no ascienden por la escala militar y no tienen evaluación de elegibilidad.`,
        );
      }
      if (!vigentes.has(clave)) {
        throw new BadRequestException(
          `${nombre} no tiene una relación laboral vigente: no se le puede registrar un ascenso.`,
        );
      }
      if (!evaluaciones.has(clave)) {
        throw new BadRequestException(
          `No se pudo evaluar la elegibilidad de ${nombre}: sin evaluación no se registra el ascenso.`,
        );
      }
    }

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

      // Solo el grado siguiente de la misma escala es un ascenso normal.
      const actual = vigentes.get(String(f.persona_id));
      const destino = grados.get(String(gradoDestinoId));
      const tipo =
        actual && destino ? clasificarAscenso(actual.grados.codigo, destino.codigo) : null;
      const fueraDeCarrera = tipo === 'SALTO' || tipo === 'CAMBIO_ESCALA';

      // Sin regla evaluable no se puede afirmar que cumplía ni que no cumplía.
      // Un salto o un cambio de escala nunca cumple: la regla es para el siguiente.
      const cumplia = fueraDeCarrera
        ? false
        : evaluacion?.regla
          ? evaluacion.estado === 'PASIBLE'
          : null;

      if (cumplia === false) {
        if (!f.motivo_excepcion?.trim()) {
          throw new BadRequestException(
            fueraDeCarrera
              ? mensajeFueraDeCarrera(tipo!, actual!.grados, destino!, f.persona_id)
              : `${evaluacion?.persona.nombre_completo ?? `El funcionario ${f.persona_id}`} no cumple los requisitos (${evaluacion?.motivo ?? 'sin detalle'}). Para ascenderlo igual hay que escribir un motivo de excepción.`,
          );
        }
        if (!puedeExcepcion) {
          throw new ForbiddenException(
            `${evaluacion?.persona.nombre_completo ?? `El funcionario ${f.persona_id}`} ${fueraDeCarrera ? 'no asciende al grado siguiente de su escala' : 'no cumple los requisitos'} y no tenés el permiso para registrar un ascenso por excepción.`,
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
        posicion_derecha: f.posicion_derecha ?? null,
        posicion_numor: f.posicion_numor ?? null,
        relacion_esperada_id: vigentes.get(String(f.persona_id))?.id ?? null,
      };
    });

    const orden = await this.prisma.$transaction(async (tx) => {
      // Todos los locks de la orden de una vez y en orden de id, antes de
      // escribir nada: dos órdenes con funcionarios en común no se cruzan.
      await this.registro.bloquearPersonas(
        tx,
        preparados.map((p) => p.persona_id),
      );

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
          posicion_derecha: p.posicion_derecha,
          posicion_numor: p.posicion_numor,
          relacion_esperada_id: p.relacion_esperada_id,
        });
      }

      return creada;
    });

    return this.obtener(Number(orden.id), {}, alcance);
  }

  /**
   * Ascensos que el usuario puede ver, o null con alcance global. Se mira la
   * relación nueva y también la anterior: al anular, la nueva se borra y el
   * ascenso quedaría invisible para su propia unidad.
   */
  private filtroAscensosPorAlcance(alcance?: AlcanceResuelto): Prisma.ascensosWhereInput | null {
    const unidades = alcance ? unidadIdsDeAlcance(alcance) : null;
    if (unidades === null) return null;
    return {
      OR: [
        { relacion_laboral_nueva: { unidad_id: { in: unidades } } },
        { relacion_laboral_anterior: { unidad_id: { in: unidades } } },
      ],
    };
  }

  /** Relación vigente de cada funcionario, por persona. */
  private async relacionesVigentes(personaIds: number[]) {
    const relaciones = await this.prisma.relaciones_laborales.findMany({
      where: { persona_id: { in: personaIds.map((id) => BigInt(id)) }, fecha_fin: null },
      orderBy: { fecha_inicio: 'desc' },
      select: {
        id: true,
        persona_id: true,
        unidad_id: true,
        grados: { select: { codigo: true, denominacion: true } },
      },
    });
    const porPersona = new Map<string, (typeof relaciones)[number]>();
    for (const r of relaciones) {
      if (!porPersona.has(r.persona_id.toString())) porPersona.set(r.persona_id.toString(), r);
    }
    return porPersona;
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
    if (query.unidad_id) {
      filtroAscensos.relacion_laboral_nueva = { unidad_id: BigInt(query.unidad_id) };
    }
    // Además del filtro de unidad que pida, el alcance: con `.unidad` solo
    // órdenes con algún funcionario suyo, y de cada una solo esos funcionarios.
    const visibles = this.filtroAscensosPorAlcance(alcance);
    if (visibles) filtroAscensos.AND = [visibles];
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
          ascensos: { where: visibles ?? undefined, include: includeAscenso },
        },
      }),
    ]);

    // Los totales usan el mismo alcance que la tabla: con `.unidad`, solo las órdenes con
    // algún funcionario suyo y, de cada una, solo esos ascensos.
    const delPeriodo = await this.prisma.ascensos_ordenes.findMany({
      where: {
        fecha_orden: { gte: desde, lt: hasta },
        ...(visibles ? { ascensos: { some: visibles } } : {}),
      },
      select: {
        anulada_en: true,
        ascensos: {
          where: visibles ?? undefined,
          select: { anulado_en: true, cumplia_requisitos: true },
        },
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

  /**
   * Los funcionarios vienen paginados; los contadores y la lista de vigentes
   * (la que nombra la confirmación de anular la orden) son de la orden entera.
   */
  async obtener(id: number, query: DetalleOrdenQueryDto = {}, alcance?: AlcanceResuelto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);

    // Con alcance de unidad solo se ven los funcionarios de sus unidades, y una
    // orden sin ninguno de ellos responde como inexistente.
    const visibles = this.filtroAscensosPorAlcance(alcance);

    const orden = await this.prisma.ascensos_ordenes.findFirst({
      where: { id: BigInt(id), ...(visibles ? { ascensos: { some: visibles } } : {}) },
      include: {
        usuario_creacion: { select: { id: true, username: true } },
        usuario_anulacion: { select: { id: true, username: true } },
        ascensos: {
          where: visibles ?? undefined,
          include: includeAscenso,
          orderBy: { id: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        },
      },
    });
    if (!orden) throw new NotFoundException(`No existe la orden de ascenso ${id}`);

    const todos = await this.prisma.ascensos.findMany({
      where: { orden_ascenso_id: orden.id, ...(visibles ?? {}) },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        anulado_en: true,
        cumplia_requisitos: true,
        personas: { select: { primer_nombre: true, primer_apellido: true } },
        grados_grado_anterior: { select: { id: true, codigo: true, denominacion: true } },
      },
    });

    return {
      ...this.mapOrden(orden, true, todos),
      page,
      pageSize,
      vigentes: todos
        .filter((a) => a.anulado_en == null)
        .map((a) => ({
          id: a.id,
          nombre_completo: a.personas
            ? `${a.personas.primer_nombre} ${a.personas.primer_apellido}`.trim()
            : null,
          grado_anterior: a.grados_grado_anterior,
        })),
    };
  }

  // ─── Anulación ────────────────────────────────────────────────────────────

  /**
   * Todo o nada: si alguno de sus ascensos ya no se puede revertir, no se anula
   * ninguno y el error dice cuál traba.
   */
  async anularOrden(
    id: number,
    motivo: string,
    usuarioId: bigint | null,
    alcance?: AlcanceResuelto,
  ) {
    const orden = await this.prisma.ascensos_ordenes.findUnique({
      where: { id: BigInt(id) },
      include: { ascensos: { select: { id: true, anulado_en: true, persona_id: true } } },
    });
    if (!orden) throw new NotFoundException(`No existe la orden de ascenso ${id}`);

    // Con alcance de unidad: si la orden no tiene funcionarios de sus unidades, 404 (como en
    // el detalle); si tiene funcionarios de otras unidades, no se puede anular entera.
    const visibles = this.filtroAscensosPorAlcance(alcance);
    if (visibles) {
      const enAlcance = await this.prisma.ascensos.count({
        where: { orden_ascenso_id: orden.id, ...visibles },
      });
      if (enAlcance === 0) throw new NotFoundException(`No existe la orden de ascenso ${id}`);
      if (enAlcance < orden.ascensos.length) {
        throw new ForbiddenException(
          'La orden incluye funcionarios de unidades fuera de tu alcance: solo la puede anular alguien con alcance sobre todos ellos.',
        );
      }
    }

    if (orden.anulada_en) {
      throw new ConflictException(
        `La orden ${orden.numero_orden ?? orden.boletin} ya está anulada`,
      );
    }

    const vigentes = orden.ascensos.filter((a) => a.anulado_en == null);

    await this.prisma.$transaction(async (tx) => {
      await this.registro.bloquearPersonas(
        tx,
        vigentes.flatMap((a) => (a.persona_id != null ? [a.persona_id] : [])),
      );
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

    return this.obtener(id, {}, alcance);
  }

  /** Anula un ascenso puntual, sin tocar el resto de la orden. */
  async anularAscenso(
    ascensoId: number,
    motivo: string,
    usuarioId: bigint | null,
    alcance?: AlcanceResuelto,
  ) {
    // Fuera del alcance responde igual que si no existiera (spec 002 §7).
    const visibles = this.filtroAscensosPorAlcance(alcance);
    if (visibles) {
      const enAlcance = await this.prisma.ascensos.count({
        where: { id: BigInt(ascensoId), ...visibles },
      });
      if (enAlcance === 0) throw new NotFoundException(`No existe el ascenso ${ascensoId}`);
    }

    const ascenso = await this.registro.anular(BigInt(ascensoId), {
      motivo,
      usuario_id: usuarioId,
    });

    return ascenso.orden_ascenso_id
      ? this.obtener(Number(ascenso.orden_ascenso_id), {}, alcance)
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
    // Con los ascensos paginados, los contadores salen de la orden entera.
    todos: { anulado_en: Date | null; cumplia_requisitos: boolean | null }[] = orden.ascensos,
  ) {
    const vigentes = todos.filter((a) => a.anulado_en == null);
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
      cantidad_funcionarios: todos.length,
      cantidad_vigentes: vigentes.length,
      cantidad_por_excepcion: todos.filter((a) => a.cumplia_requisitos === false).length,
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

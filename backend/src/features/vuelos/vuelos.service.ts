import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Borders, Workbook } from 'exceljs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { assertPersonaEnAlcance, wherePersonasPorAlcance } from '../../lib/alcance/alcance.where';
import { CATEGORIAS_PERSONAL } from '../../lib/personal/categoria-personal';
import { CreatePeriodoVueloDto } from './dto/create-periodo-vuelo.dto';
import { UpdatePeriodoVueloDto } from './dto/update-periodo-vuelo.dto';
import { UpdateRegistroVueloDto } from './dto/update-registro-vuelo.dto';
import {
  EstadoRegistroVuelo,
  FiltrosRegistrosVueloDto,
  ListRegistrosVueloQueryDto,
} from './dto/list-registros-vuelo-query.dto';
import type { CategoriaPersonal } from '../../lib/personal/categoria-personal';
import { CreateUnidadVueloDto } from './dto/create-unidad-vuelo.dto';
import { UpdateUnidadVueloDto } from './dto/update-unidad-vuelo.dto';

type Tx = Prisma.TransactionClient;

const ORDINALES: Record<number, string> = { 1: '1er', 2: '2do', 3: '3er', 4: '4to' };

export const etiquetaPeriodo = (p: { anio: number; numero: number }) =>
  `${ORDINALES[p.numero] ?? `${p.numero}°`} Período ${p.anio}`;

/** Las horas se guardan con un decimal; la resta de decimales en JS deja colas (0.30000000000000004). */
const redondear = (n: number) => Math.round(n * 10) / 10;
const horas = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

/** "PEREZ PEREZ, Juan R.", como lo escriben en la planilla. */
export function nombrePlanilla(p: {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}): string {
  const apellidos = [p.primer_apellido, p.segundo_apellido].filter(Boolean).join(' ').toUpperCase();
  const inicial = p.segundo_nombre?.trim() ? ` ${p.segundo_nombre.trim()[0].toUpperCase()}.` : '';
  return `${apellidos}, ${p.primer_nombre}${inicial}`;
}

type Horas = Prisma.Decimal | number | null | undefined;

/** Total del registro: la suma de las 4 columnas de horas, como lo pidió la Oficina de Personal. */
export function totalHoras(r: {
  hs_av_anio_militar: Horas;
  hs_av_total: Horas;
  hs_ob_anio_militar: Horas;
  hs_ob_total: Horas;
}): number {
  return redondear(
    horas(r.hs_av_anio_militar) + horas(r.hs_av_total) + horas(r.hs_ob_anio_militar) + horas(r.hs_ob_total),
  );
}

/** Pendiente = fila generada al abrir el período que nadie editó todavía. */
const WHERE_ESTADO: Record<EstadoRegistroVuelo, Prisma.registros_vueloWhereInput> = {
  pendientes: { editado_en: null },
  cargados: { editado_en: { not: null } },
};

const COLUMNAS_EXPORTACION: { titulo: string; clave: string; ancho: number; horas?: boolean }[] = [
  { titulo: 'Grado', clave: 'grado', ancho: 16 },
  { titulo: 'Esc.', clave: 'escalafon', ancho: 10 },
  { titulo: 'Nombre y apellido', clave: 'nombre', ancho: 32 },
  { titulo: 'Cédula', clave: 'cedula', ancho: 12 },
  { titulo: 'Período de vuelo', clave: 'periodo', ancho: 18 },
  { titulo: 'Unidad de vuelo', clave: 'unidad', ancho: 16 },
  { titulo: 'Aeronaves', clave: 'aeronaves', ancho: 50 },
  { titulo: 'Hs Av Año Militar', clave: 'hs_av_anio_militar', ancho: 12, horas: true },
  { titulo: 'Hs Av Total', clave: 'hs_av_total', ancho: 12, horas: true },
  { titulo: 'Hs Ob Año Militar', clave: 'hs_ob_anio_militar', ancho: 12, horas: true },
  { titulo: 'Hs Ob Total', clave: 'hs_ob_total', ancho: 12, horas: true },
  { titulo: 'Total', clave: 'total', ancho: 12, horas: true },
];

@Injectable()
export class VuelosService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly includeRegistro = {
    personas: {
      select: {
        id: true,
        cedula: true,
        primer_nombre: true,
        segundo_nombre: true,
        primer_apellido: true,
        segundo_apellido: true,
      },
    },
    grados: { select: { id: true, codigo: true, denominacion: true } },
    escalafones: { select: { id: true, codigo: true, denominacion: true } },
    unidades_vuelo: { select: { id: true, denominacion: true } },
  } satisfies Prisma.registros_vueloInclude;

  // Orden de la planilla: oficiales primero, por jerarquía y después por apellido.
  private readonly ordenRegistros: Prisma.registros_vueloOrderByWithRelationInput[] = [
    { tipo_funcionario: 'asc' },
    { grados: { derecha_jerarquia: { posicion: 'asc' } } },
    { personas: { primer_apellido: 'asc' } },
    { personas: { primer_nombre: 'asc' } },
  ];

  private mapPeriodo(p: any, conteos?: { total: number; editados: number }) {
    return {
      id: p.id.toString(),
      anio: p.anio,
      numero: p.numero,
      etiqueta: etiquetaPeriodo(p),
      cerrado: p.cerrado,
      creado_en: p.creado_en,
      ...(conteos && { total_registros: conteos.total, registros_editados: conteos.editados }),
    };
  }

  private mapRegistro(r: any, periodo: { anio: number; numero: number }) {
    return {
      id: r.id.toString(),
      periodo_id: r.periodo_id.toString(),
      periodo: etiquetaPeriodo(periodo),
      persona: {
        id: r.personas.id.toString(),
        cedula: r.personas.cedula,
        primer_nombre: r.personas.primer_nombre,
        segundo_nombre: r.personas.segundo_nombre,
        primer_apellido: r.personas.primer_apellido,
        segundo_apellido: r.personas.segundo_apellido,
        nombre_completo: nombrePlanilla(r.personas),
      },
      grado: r.grados ? { id: r.grados.id.toString(), denominacion: r.grados.denominacion } : null,
      escalafon: r.escalafones
        ? { id: r.escalafones.id.toString(), denominacion: r.escalafones.denominacion }
        : null,
      tipo_funcionario: r.tipo_funcionario,
      unidad_vuelo: r.unidades_vuelo
        ? { id: r.unidades_vuelo.id.toString(), denominacion: r.unidades_vuelo.denominacion }
        : null,
      aeronaves: r.aeronaves,
      hs_av_anio_militar: horas(r.hs_av_anio_militar),
      hs_av_total: horas(r.hs_av_total),
      hs_ob_anio_militar: horas(r.hs_ob_anio_militar),
      hs_ob_total: horas(r.hs_ob_total),
      total: totalHoras(r),
      editado_en: r.editado_en,
    };
  }

  private async obtenerPeriodoOFallar(periodoId: number | bigint, db: Tx | PrismaService = this.prisma) {
    const periodo = await db.periodos_vuelo.findUnique({ where: { id: BigInt(periodoId) } });
    if (!periodo) throw new NotFoundException(`No existe el período de vuelo ${periodoId}`);
    return periodo;
  }

  private assertAbierto(periodo: { cerrado: boolean; anio: number; numero: number }) {
    if (periodo.cerrado) {
      throw new ConflictException(`El ${etiquetaPeriodo(periodo)} está cerrado: reabrilo para modificarlo`);
    }
  }

  /** Períodos anteriores a uno dado, en cualquier año. */
  private whereAnteriorA(p: { anio: number; numero: number }): Prisma.periodos_vueloWhereInput {
    return { OR: [{ anio: { lt: p.anio } }, { anio: p.anio, numero: { lt: p.numero } }] };
  }

  // ─── Períodos ───────────────────────────────────────────────────────────────

  /** El avance de carga de cada período cuenta solo oficiales o subalternos si se pide `categoria`. */
  async listarPeriodos(alcance: AlcanceResuelto, categoria?: CategoriaPersonal) {
    const where: Prisma.registros_vueloWhereInput = {
      personas: wherePersonasPorAlcance(alcance),
      ...(categoria && { tipo_funcionario: categoria }),
    };
    const [periodos, totales, editados] = await this.prisma.$transaction([
      this.prisma.periodos_vuelo.findMany({ orderBy: [{ anio: 'desc' }, { numero: 'desc' }] }),
      this.prisma.registros_vuelo.groupBy({
        by: ['periodo_id'],
        where,
        orderBy: { periodo_id: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.registros_vuelo.groupBy({
        by: ['periodo_id'],
        where: { ...where, ...WHERE_ESTADO.cargados },
        orderBy: { periodo_id: 'asc' },
        _count: { _all: true },
      }),
    ]);

    const contar = (filas: any[]) =>
      new Map<string, number>(filas.map((f) => [f.periodo_id.toString(), f._count._all]));
    const porTotal = contar(totales);
    const porEditados = contar(editados);

    return periodos.map((p) =>
      this.mapPeriodo(p, {
        total: porTotal.get(p.id.toString()) ?? 0,
        editados: porEditados.get(p.id.toString()) ?? 0,
      }),
    );
  }

  /** Abre un período y le genera una fila a cada funcionario en actividad. */
  async crearPeriodo(dto: CreatePeriodoVueloDto, usuarioId: bigint | null) {
    const existente = await this.prisma.periodos_vuelo.findUnique({
      where: { anio_numero: { anio: dto.anio, numero: dto.numero } },
    });
    if (existente) {
      throw new ConflictException(`El ${etiquetaPeriodo(dto)} ya existe`);
    }

    return this.prisma.$transaction(
      async (tx) => {
        const periodo = await tx.periodos_vuelo.create({
          data: { anio: dto.anio, numero: dto.numero, usuario_id: usuarioId },
        });
        const generados = await this.generarRegistros(tx, periodo);
        return { ...this.mapPeriodo(periodo, { total: generados, editados: 0 }), registros_generados: generados };
      },
      { timeout: 60_000 },
    );
  }

  /** Agrega al período a quienes entraron en actividad después de abrirlo. */
  async sincronizarPeriodo(periodoId: number) {
    const periodo = await this.obtenerPeriodoOFallar(periodoId);
    this.assertAbierto(periodo);
    const agregados = await this.prisma.$transaction((tx) => this.generarRegistros(tx, periodo), {
      timeout: 60_000,
    });
    return { ...this.mapPeriodo(periodo), registros_agregados: agregados };
  }

  /**
   * Una fila por persona en actividad (oficial o subalterno) que todavía no esté en el
   * período. Arrastra del último período anterior la unidad de vuelo, las aeronaves y los
   * totales, como hacían copiando la hoja anterior del Excel. El año militar solo se
   * arrastra dentro del mismo año: en el 1er período arranca en cero.
   */
  private async generarRegistros(tx: Tx, periodo: { id: bigint; anio: number; numero: number }) {
    const [relaciones, yaEnPeriodo] = await Promise.all([
      tx.relaciones_laborales.findMany({
        where: {
          fecha_fin: null,
          estado: 'activo',
          tipo_funcionario: { in: [...CATEGORIAS_PERSONAL] },
        },
        orderBy: { fecha_inicio: 'desc' },
        select: { persona_id: true, grado_id: true, escalafon_id: true, tipo_funcionario: true },
      }),
      tx.registros_vuelo.findMany({ where: { periodo_id: periodo.id }, select: { persona_id: true } }),
    ]);

    const presentes = new Set(yaEnPeriodo.map((r) => r.persona_id.toString()));
    const porPersona = new Map<string, (typeof relaciones)[number]>();
    for (const rel of relaciones) {
      const clave = rel.persona_id.toString();
      // Con más de una relación abierta vale la más reciente (vienen ordenadas).
      if (!presentes.has(clave) && !porPersona.has(clave)) porPersona.set(clave, rel);
    }
    if (porPersona.size === 0) return 0;

    const previos = await tx.registros_vuelo.findMany({
      where: {
        persona_id: { in: [...porPersona.values()].map((r) => r.persona_id) },
        periodos_vuelo: this.whereAnteriorA(periodo),
      },
      orderBy: [{ periodos_vuelo: { anio: 'desc' } }, { periodos_vuelo: { numero: 'desc' } }],
      select: {
        persona_id: true,
        unidad_vuelo_id: true,
        aeronaves: true,
        hs_av_anio_militar: true,
        hs_av_total: true,
        hs_ob_anio_militar: true,
        hs_ob_total: true,
        periodos_vuelo: { select: { anio: true } },
      },
    });
    const ultimoPrevio = new Map<string, (typeof previos)[number]>();
    for (const p of previos) {
      const clave = p.persona_id.toString();
      if (!ultimoPrevio.has(clave)) ultimoPrevio.set(clave, p);
    }

    const data = [...porPersona.entries()].map(([clave, rel]) => {
      const previo = ultimoPrevio.get(clave);
      const mismoAnio = previo?.periodos_vuelo.anio === periodo.anio;
      return {
        periodo_id: periodo.id,
        persona_id: rel.persona_id,
        grado_id: rel.grado_id,
        escalafon_id: rel.escalafon_id,
        tipo_funcionario: rel.tipo_funcionario,
        unidad_vuelo_id: previo?.unidad_vuelo_id ?? null,
        aeronaves: previo?.aeronaves ?? null,
        hs_av_anio_militar: mismoAnio ? previo!.hs_av_anio_militar : 0,
        hs_av_total: previo?.hs_av_total ?? 0,
        hs_ob_anio_militar: mismoAnio ? previo!.hs_ob_anio_militar : 0,
        hs_ob_total: previo?.hs_ob_total ?? 0,
      };
    });

    const { count } = await tx.registros_vuelo.createMany({ data, skipDuplicates: true });
    return count;
  }

  async actualizarPeriodo(periodoId: number, dto: UpdatePeriodoVueloDto) {
    await this.obtenerPeriodoOFallar(periodoId);
    const actualizado = await this.prisma.periodos_vuelo.update({
      where: { id: BigInt(periodoId) },
      data: { cerrado: dto.cerrado },
    });
    return this.mapPeriodo(actualizado);
  }

  /** Para deshacer un período abierto por error: solo si nadie cargó nada todavía. */
  async eliminarPeriodo(periodoId: number) {
    const periodo = await this.obtenerPeriodoOFallar(periodoId);
    const editados = await this.prisma.registros_vuelo.count({
      where: { periodo_id: periodo.id, editado_en: { not: null } },
    });
    if (editados > 0) {
      throw new ConflictException(
        `No se puede eliminar el ${etiquetaPeriodo(periodo)}: ya tiene ${editados} registro(s) cargado(s). Cerralo en su lugar.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.historial_unidad_vuelo.deleteMany({ where: { periodo_id: periodo.id } }),
      this.prisma.registros_vuelo.deleteMany({ where: { periodo_id: periodo.id } }),
      this.prisma.periodos_vuelo.delete({ where: { id: periodo.id } }),
    ]);
    return { id: periodo.id.toString(), eliminado: true };
  }

  // ─── Registros ──────────────────────────────────────────────────────────────

  private whereRegistros(
    periodoId: bigint,
    filtros: Omit<FiltrosRegistrosVueloDto, 'estado'>,
    alcance: AlcanceResuelto,
  ): Prisma.registros_vueloWhereInput {
    const texto = filtros.query?.trim();
    const personas: Prisma.personasWhereInput = {
      ...wherePersonasPorAlcance(alcance),
      ...(texto && {
        OR: [
          { cedula: { contains: texto, mode: 'insensitive' } },
          { primer_nombre: { contains: texto, mode: 'insensitive' } },
          { segundo_nombre: { contains: texto, mode: 'insensitive' } },
          { primer_apellido: { contains: texto, mode: 'insensitive' } },
          { segundo_apellido: { contains: texto, mode: 'insensitive' } },
        ],
      }),
    };

    return {
      periodo_id: periodoId,
      personas,
      ...(filtros.categoria && { tipo_funcionario: filtros.categoria }),
      ...(filtros.grado_id && { grado_id: BigInt(filtros.grado_id) }),
      ...(filtros.escalafon_id && { escalafon_id: BigInt(filtros.escalafon_id) }),
      ...(filtros.sin_unidad
        ? { unidad_vuelo_id: null }
        : filtros.unidad_vuelo_id && { unidad_vuelo_id: BigInt(filtros.unidad_vuelo_id) }),
    };
  }

  /**
   * `stats` resume el período para la categoría elegida (lo que muestra la cabecera del
   * período); `conteos` son las pestañas Todos / Pendientes / Cargados con los demás filtros.
   */
  async listarRegistros(periodoId: number, query: ListRegistrosVueloQueryDto, alcance: AlcanceResuelto) {
    const periodo = await this.obtenerPeriodoOFallar(periodoId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);
    const { estado, ...filtros } = query;
    const sinEstado = this.whereRegistros(periodo.id, filtros, alcance);
    const where = estado ? { AND: [sinEstado, WHERE_ESTADO[estado]] } : sinEstado;
    const delPeriodo = this.whereRegistros(periodo.id, { categoria: filtros.categoria }, alcance);

    const [total, filas, todos, cargados, porCategoria, cargadosPeriodo, horasCargadas] =
      await this.prisma.$transaction([
        this.prisma.registros_vuelo.count({ where }),
        this.prisma.registros_vuelo.findMany({
          where,
          orderBy: this.ordenRegistros,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: this.includeRegistro,
        }),
        this.prisma.registros_vuelo.count({ where: sinEstado }),
        this.prisma.registros_vuelo.count({ where: { AND: [sinEstado, WHERE_ESTADO.cargados] } }),
        this.prisma.registros_vuelo.groupBy({
          by: ['tipo_funcionario'],
          where: delPeriodo,
          orderBy: { tipo_funcionario: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.registros_vuelo.count({ where: { AND: [delPeriodo, WHERE_ESTADO.cargados] } }),
        this.prisma.registros_vuelo.aggregate({
          where: { AND: [delPeriodo, WHERE_ESTADO.cargados] },
          _sum: { hs_av_anio_militar: true, hs_av_total: true, hs_ob_anio_militar: true, hs_ob_total: true },
        }),
      ]);

    const cantidad = (tipo: string) =>
      (porCategoria as any[]).find((c) => c.tipo_funcionario === tipo)?._count._all ?? 0;
    const oficiales = cantidad('oficial');
    const subalternos = cantidad('subalterno');

    return {
      periodo: this.mapPeriodo(periodo),
      items: filas.map((f) => this.mapRegistro(f, periodo)),
      total,
      page,
      pageSize,
      stats: {
        total: oficiales + subalternos,
        cargados: cargadosPeriodo,
        oficiales,
        subalternos,
        horas_cargadas: totalHoras(horasCargadas._sum),
      },
      conteos: { todos, pendientes: todos - cargados, cargados },
    };
  }

  async editarRegistro(
    registroId: number,
    dto: UpdateRegistroVueloDto,
    usuarioId: bigint | null,
    alcance: AlcanceResuelto,
  ) {
    const registro = await this.prisma.registros_vuelo.findUnique({
      where: { id: BigInt(registroId) },
      include: { periodos_vuelo: true },
    });
    if (!registro) throw new NotFoundException(`No existe el registro de vuelo ${registroId}`);
    await assertPersonaEnAlcance(this.prisma, registro.persona_id, alcance);
    this.assertAbierto(registro.periodos_vuelo);

    const nuevaUnidad =
      dto.unidad_vuelo_id === undefined
        ? registro.unidad_vuelo_id
        : dto.unidad_vuelo_id === null
          ? null
          : BigInt(dto.unidad_vuelo_id);
    const cambiaUnidad = nuevaUnidad !== registro.unidad_vuelo_id;

    if (cambiaUnidad && nuevaUnidad !== null) {
      const unidad = await this.prisma.unidades_vuelo.findUnique({ where: { id: nuevaUnidad } });
      if (!unidad) throw new NotFoundException(`No existe la unidad de vuelo ${nuevaUnidad}`);
      if (!unidad.vigente) {
        throw new BadRequestException(`La unidad de vuelo ${unidad.denominacion} está dada de baja`);
      }
    }

    const aeronaves = dto.aeronaves === undefined ? undefined : dto.aeronaves?.trim() || null;

    const actualizado = await this.prisma.$transaction(async (tx) => {
      if (cambiaUnidad) {
        await tx.historial_unidad_vuelo.create({
          data: {
            persona_id: registro.persona_id,
            periodo_id: registro.periodo_id,
            unidad_anterior_id: registro.unidad_vuelo_id,
            unidad_nueva_id: nuevaUnidad,
            usuario_id: usuarioId,
          },
        });
      }
      return tx.registros_vuelo.update({
        where: { id: registro.id },
        data: {
          ...(cambiaUnidad && { unidad_vuelo_id: nuevaUnidad }),
          ...(aeronaves !== undefined && { aeronaves }),
          ...(dto.hs_av_anio_militar !== undefined && { hs_av_anio_militar: dto.hs_av_anio_militar }),
          ...(dto.hs_av_total !== undefined && { hs_av_total: dto.hs_av_total }),
          ...(dto.hs_ob_anio_militar !== undefined && { hs_ob_anio_militar: dto.hs_ob_anio_militar }),
          ...(dto.hs_ob_total !== undefined && { hs_ob_total: dto.hs_ob_total }),
          editado_en: new Date(),
          editado_por: usuarioId,
        },
        include: this.includeRegistro,
      });
    });

    return this.mapRegistro(actualizado, registro.periodos_vuelo);
  }

  /** Todos los períodos de una persona y cada cambio de unidad de vuelo que tuvo. */
  async historialPersona(personaId: number, alcance: AlcanceResuelto) {
    const id = BigInt(personaId);
    await assertPersonaEnAlcance(this.prisma, id, alcance);
    const persona = await this.prisma.personas.findUnique({
      where: { id },
      select: this.includeRegistro.personas.select,
    });
    if (!persona) throw new NotFoundException(`No existe personal con id ${personaId}`);

    const [registros, cambios] = await this.prisma.$transaction([
      this.prisma.registros_vuelo.findMany({
        where: { persona_id: id },
        orderBy: [{ periodos_vuelo: { anio: 'asc' } }, { periodos_vuelo: { numero: 'asc' } }],
        include: { ...this.includeRegistro, periodos_vuelo: true },
      }),
      this.prisma.historial_unidad_vuelo.findMany({
        where: { persona_id: id },
        orderBy: { fecha: 'desc' },
        include: {
          periodos_vuelo: true,
          unidad_anterior: { select: { id: true, denominacion: true } },
          unidad_nueva: { select: { id: true, denominacion: true } },
          usuarios: { select: { id: true, username: true } },
        },
      }),
    ]);

    const mapeados = registros.map((r) => ({
      ...this.mapRegistro(r, r.periodos_vuelo),
      periodo_cerrado: r.periodos_vuelo.cerrado,
    }));

    return {
      persona: {
        id: persona.id.toString(),
        cedula: persona.cedula,
        nombre_completo: nombrePlanilla(persona),
      },
      registros: mapeados.reverse(),
      cambios_unidad: cambios.map((c) => ({
        id: c.id.toString(),
        periodo_id: c.periodo_id.toString(),
        periodo: etiquetaPeriodo(c.periodos_vuelo),
        unidad_anterior: c.unidad_anterior
          ? { id: c.unidad_anterior.id.toString(), denominacion: c.unidad_anterior.denominacion }
          : null,
        unidad_nueva: c.unidad_nueva
          ? { id: c.unidad_nueva.id.toString(), denominacion: c.unidad_nueva.denominacion }
          : null,
        usuario: c.usuarios?.username ?? null,
        fecha: c.fecha,
      })),
    };
  }

  // ─── Exportación ────────────────────────────────────────────────────────────

  /**
   * Un libro con una hoja por cada período del año, con todo el personal de cada uno, o solo
   * oficiales o subalternos. No usa los demás filtros de la pantalla; sí el alcance (una
   * unidad exporta a su gente).
   */
  async exportarAnio(anio: number, alcance: AlcanceResuelto, categoria?: CategoriaPersonal) {
    const periodos = await this.prisma.periodos_vuelo.findMany({
      where: { anio },
      orderBy: { numero: 'asc' },
    });
    if (periodos.length === 0) throw new NotFoundException(`No hay períodos de vuelo abiertos en ${anio}`);

    const wb = new Workbook();
    wb.creator = 'Sistema de Gestión de Personal FAU';
    for (const periodo of periodos) {
      const filas = await this.prisma.registros_vuelo.findMany({
        where: this.whereRegistros(periodo.id, { categoria }, alcance),
        orderBy: this.ordenRegistros,
        include: this.includeRegistro,
      });
      this.agregarHoja(wb, etiquetaPeriodo(periodo), filas.map((f) => this.mapRegistro(f, periodo)));
    }

    const sufijo = categoria ? `_${categoria === 'oficial' ? 'oficiales' : 'subalternos'}` : '';
    return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), nombreArchivo: `horas_vuelo_${anio}${sufijo}.xlsx` };
  }

  private agregarHoja(wb: Workbook, etiqueta: string, registros: ReturnType<VuelosService['mapRegistro']>[]) {
    const ws = wb.addWorksheet(etiqueta, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = COLUMNAS_EXPORTACION.map((c) => ({ key: c.clave, width: c.ancho }));

    const header = ws.addRow(COLUMNAS_EXPORTACION.map((c) => c.titulo));
    header.height = 30;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132744' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = bordeFino();
    });

    for (const r of registros) {
      const valores: Record<string, string | number> = {
        grado: r.grado?.denominacion ?? '',
        escalafon: r.escalafon?.denominacion ?? '',
        nombre: r.persona.nombre_completo,
        cedula: r.persona.cedula,
        periodo: etiqueta,
        unidad: r.unidad_vuelo?.denominacion ?? '',
        aeronaves: r.aeronaves ?? '',
        hs_av_anio_militar: r.hs_av_anio_militar,
        hs_av_total: r.hs_av_total,
        hs_ob_anio_militar: r.hs_ob_anio_militar,
        hs_ob_total: r.hs_ob_total,
        total: r.total,
      };
      const row = ws.addRow(COLUMNAS_EXPORTACION.map((c) => valores[c.clave]));
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = bordeFino();
        if (COLUMNAS_EXPORTACION[col - 1]?.horas) {
          cell.numFmt = '0.0';
          cell.alignment = { horizontal: 'right' };
        }
      });
    }
  }

  // ─── Unidades de vuelo ──────────────────────────────────────────────────────

  private mapUnidad(u: { id: bigint; denominacion: string; vigente: boolean }) {
    return { id: u.id.toString(), denominacion: u.denominacion, vigente: u.vigente };
  }

  async listarUnidades() {
    const unidades = await this.prisma.unidades_vuelo.findMany({ orderBy: { denominacion: 'asc' } });
    return unidades.map((u) => this.mapUnidad(u));
  }

  private async assertDenominacionLibre(denominacion: string, exceptoId?: bigint) {
    const repetida = await this.prisma.unidades_vuelo.findFirst({
      where: {
        denominacion: { equals: denominacion, mode: 'insensitive' },
        ...(exceptoId && { id: { not: exceptoId } }),
      },
    });
    if (repetida) throw new ConflictException(`Ya existe la unidad de vuelo ${repetida.denominacion}`);
  }

  async crearUnidad(dto: CreateUnidadVueloDto) {
    await this.assertDenominacionLibre(dto.denominacion);
    const creada = await this.prisma.unidades_vuelo.create({ data: { denominacion: dto.denominacion } });
    return this.mapUnidad(creada);
  }

  async editarUnidad(unidadId: number, dto: UpdateUnidadVueloDto) {
    const id = BigInt(unidadId);
    const unidad = await this.prisma.unidades_vuelo.findUnique({ where: { id } });
    if (!unidad) throw new NotFoundException(`No existe la unidad de vuelo ${unidadId}`);
    if (dto.denominacion !== undefined) await this.assertDenominacionLibre(dto.denominacion, id);

    const actualizada = await this.prisma.unidades_vuelo.update({
      where: { id },
      data: {
        ...(dto.denominacion !== undefined && { denominacion: dto.denominacion }),
        ...(dto.vigente !== undefined && { vigente: dto.vigente }),
      },
    });
    return this.mapUnidad(actualizada);
  }
}

function bordeFino(): Partial<Borders> {
  const color = { argb: 'FFDBE2EC' };
  return {
    top: { style: 'thin', color },
    left: { style: 'thin', color },
    bottom: { style: 'thin', color },
    right: { style: 'thin', color },
  };
}

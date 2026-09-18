import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import {
  SITUACIONES_BLOQUEANTES_POR_DEFECTO,
  SITUACIONES_ELEGIBLES_POR_DEFECTO,
} from './ascensos.constants.js';
import {
  DatosFuncionario,
  ReglaEvaluable,
  ResultadoElegibilidad,
  evaluarFuncionario,
} from './elegibilidad.evaluador.js';
import {
  ESTADOS_POR_DEFECTO,
  ListPasiblesQueryDto,
} from './dto/list-pasibles-query.dto.js';
import { SimularImpactoDto } from './dto/simular-impacto.dto.js';

const listaDeEnv = (nombre: string, porDefecto: string[]): string[] => {
  const crudo = process.env[nombre];
  if (!crudo) return porDefecto;
  const valores = crudo
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return valores.length > 0 ? valores : porDefecto;
};

const inicioDelDia = (fecha: Date) =>
  new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));

/**
 * Motor de elegibilidad: quién puede ascender, quién no y por qué. Carga en lote
 * lo que hace falta y delega la evaluación en `evaluarFuncionario`. Con la
 * dotación de la fuerza alcanza con calcular en cada consulta.
 */
@Injectable()
export class ElegibilidadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Configurables por variable de entorno. */
  get situacionesElegibles(): string[] {
    return listaDeEnv('ASCENSOS_SITUACIONES_ELEGIBLES', SITUACIONES_ELEGIBLES_POR_DEFECTO);
  }

  get situacionesBloqueantes(): string[] {
    return listaDeEnv('ASCENSOS_SITUACIONES_BLOQUEANTES', SITUACIONES_BLOQUEANTES_POR_DEFECTO);
  }

  // ─── Listado de pasibles ──────────────────────────────────────────────────

  async listarPasibles(query: ListPasiblesQueryDto = {}, alcance?: AlcanceResuelto) {
    const fechaRef = this.fechaDeReferencia(query.fecha_referencia);
    const evaluados = await this.evaluarTodos(query, alcance, fechaRef);

    const estados = query.estado?.length ? query.estado : ESTADOS_POR_DEFECTO;
    const horizonte = query.horizonte_meses ?? 6;
    const limiteProximos = new Date(fechaRef);
    limiteProximos.setUTCMonth(limiteProximos.getUTCMonth() + horizonte);

    const filtrados = evaluados.filter((e) => {
      if (!estados.includes(e.estado)) return false;
      // Un próximo que cumple dentro de diez años no es accionable.
      if (e.estado === 'PROXIMO' && e.fecha_cumpliria) {
        return new Date(e.fecha_cumpliria) <= limiteProximos;
      }
      return true;
    });

    // Por decisión de la FAU: sin orden de precedencia, por apellido.
    filtrados.sort((a, b) =>
      a.persona.apellido.localeCompare(b.persona.apellido, 'es') ||
      a.persona.nombre_completo.localeCompare(b.persona.nombre_completo, 'es'),
    );

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 500);

    return {
      items: filtrados.slice((page - 1) * pageSize, page * pageSize),
      total: filtrados.length,
      page,
      pageSize,
      fecha_referencia: fechaRef.toISOString().split('T')[0],
      horizonte_meses: horizonte,
      stats: this.contarPorEstado(evaluados),
    };
  }

  /** Contadores por estado, escalafón y unidad. */
  async resumen(query: ListPasiblesQueryDto = {}, alcance?: AlcanceResuelto) {
    const fechaRef = this.fechaDeReferencia(query.fecha_referencia);
    const evaluados = await this.evaluarTodos(query, alcance, fechaRef);

    const porEscalafon = new Map<string, { escalafon: string; total: number; pasibles: number }>();
    const porUnidad = new Map<string, { unidad: string; total: number; pasibles: number }>();
    const cursosQueBloquean = new Map<string, number>();

    for (const e of evaluados) {
      const escalafon = e.persona.escalafon?.denominacion ?? 'Sin escalafón';
      const unidad = e.persona.unidad?.denominacion ?? 'Sin unidad';
      const esPasible = e.estado === 'PASIBLE';

      const acumEsc = porEscalafon.get(escalafon) ?? { escalafon, total: 0, pasibles: 0 };
      porEscalafon.set(escalafon, {
        escalafon,
        total: acumEsc.total + 1,
        pasibles: acumEsc.pasibles + (esPasible ? 1 : 0),
      });

      const acumUni = porUnidad.get(unidad) ?? { unidad, total: 0, pasibles: 0 };
      porUnidad.set(unidad, {
        unidad,
        total: acumUni.total + 1,
        pasibles: acumUni.pasibles + (esPasible ? 1 : 0),
      });

      // Sirve para que la Escuela sepa dónde abrir cupos.
      if (e.estado === 'BLOQUEADO') {
        for (const req of e.requisitos) {
          if (req.tipo !== 'CURSO_APROBADO' || !req.aplica || req.cumple) continue;
          for (const curso of req.cursos ?? []) {
            if (curso.estado === 'APROBADO') continue;
            cursosQueBloquean.set(curso.nombre, (cursosQueBloquean.get(curso.nombre) ?? 0) + 1);
          }
        }
      }
    }

    return {
      fecha_referencia: fechaRef.toISOString().split('T')[0],
      total_evaluados: evaluados.length,
      por_estado: this.contarPorEstado(evaluados),
      por_escalafon: [...porEscalafon.values()].sort((a, b) => b.total - a.total),
      por_unidad: [...porUnidad.values()].sort((a, b) => b.total - a.total),
      cursos_que_bloquean: [...cursosQueBloquean.entries()]
        .map(([curso, funcionarios]) => ({ curso, funcionarios }))
        .sort((a, b) => b.funcionarios - a.funcionarios)
        .slice(0, 10),
      sin_fecha_nacimiento: evaluados.filter((e) => e.edad == null).length,
    };
  }

  /** Evaluación completa de un funcionario. */
  async evaluarPersona(
    personaId: number,
    fechaReferencia?: string,
    alcance?: AlcanceResuelto,
  ): Promise<ResultadoElegibilidad> {
    const fechaRef = this.fechaDeReferencia(fechaReferencia);
    const evaluados = await this.evaluarTodos({}, alcance, fechaRef, [BigInt(personaId)]);

    const resultado = evaluados[0];
    if (!resultado) {
      throw new NotFoundException(
        `El funcionario ${personaId} no tiene una relación laboral vigente para evaluar`,
      );
    }
    return resultado;
  }

  /**
   * Compara a los funcionarios del grado bajo la regla vigente y bajo una
   * hipotética, para ver a quién le cambia el estado antes de guardar.
   */
  async simularImpacto(
    reglaId: number,
    cambios: SimularImpactoDto,
    alcance?: AlcanceResuelto,
  ) {
    const reglaActual = await this.cargarRegla(BigInt(reglaId));
    if (!reglaActual) throw new NotFoundException(`No existe la regla de ascenso ${reglaId}`);

    const requisitosSimulados = cambios.requisitos
      ? await this.requisitosDesdeDto(cambios.requisitos)
      : undefined;

    const fechaRef = this.fechaDeReferencia();
    const opciones = {
      fecha_referencia: fechaRef,
      situaciones_elegibles: this.situacionesElegibles,
      situaciones_bloqueantes: this.situacionesBloqueantes,
    };

    const funcionarios = await this.cargarFuncionarios(
      { grado_id: Number(reglaActual.grado_origen_id) },
      alcance,
    );

    const reglaSimulada: ReglaEvaluable = {
      ...reglaActual,
      dias_minimos: cambios.dias_minimos ?? reglaActual.dias_minimos,
      edad_maxima:
        cambios.edad_maxima !== undefined ? cambios.edad_maxima : reglaActual.edad_maxima,
      requisitos: requisitosSimulados ?? reglaActual.requisitos,
    };

    const ganan: ResultadoElegibilidad[] = [];
    const pierden: ResultadoElegibilidad[] = [];
    let sinCambio = 0;

    for (const datos of funcionarios) {
      const antes = evaluarFuncionario(datos, reglaActual, opciones);
      const despues = evaluarFuncionario(datos, reglaSimulada, opciones);

      if (antes.estado !== 'PASIBLE' && despues.estado === 'PASIBLE') ganan.push(despues);
      else if (antes.estado === 'PASIBLE' && despues.estado !== 'PASIBLE') pierden.push(despues);
      else sinCambio++;
    }

    return {
      regla: { id: reglaActual.id, nombre: reglaActual.nombre },
      evaluados: funcionarios.length,
      pasan_a_pasibles: ganan.length,
      dejan_de_ser_pasibles: pierden.length,
      sin_cambio: sinCambio,
      ganan,
      pierden,
    };
  }

  // ─── Carga en lote ────────────────────────────────────────────────────────

  /** Varios funcionarios a la misma fecha, en una sola pasada. */
  async evaluarVarios(
    personaIds: number[],
    fechaReferencia?: string,
    alcance?: AlcanceResuelto,
  ): Promise<Map<string, ResultadoElegibilidad>> {
    if (personaIds.length === 0) return new Map();

    const fechaRef = this.fechaDeReferencia(fechaReferencia);
    const evaluados = await this.evaluarTodos(
      {},
      alcance,
      fechaRef,
      personaIds.map((id) => BigInt(id)),
    );
    return new Map(evaluados.map((e) => [e.persona.id, e]));
  }

  private async evaluarTodos(
    query: ListPasiblesQueryDto,
    alcance: AlcanceResuelto | undefined,
    fechaRef: Date,
    personaIds?: bigint[],
  ): Promise<ResultadoElegibilidad[]> {
    const [funcionarios, reglas] = await Promise.all([
      this.cargarFuncionarios(query, alcance, personaIds),
      this.cargarReglas(),
    ]);

    const opciones = {
      fecha_referencia: fechaRef,
      situaciones_elegibles: this.situacionesElegibles,
      situaciones_bloqueantes: this.situacionesBloqueantes,
    };

    return funcionarios.map((datos) =>
      evaluarFuncionario(datos, reglas.get(datos.grado.id) ?? null, opciones),
    );
  }

  /** Una sola pasada por la nómina vigente y sus datos asociados. */
  private async cargarFuncionarios(
    query: Pick<ListPasiblesQueryDto, 'escalafon_id' | 'grado_id' | 'unidad_id' | 'query'>,
    alcance?: AlcanceResuelto,
    personaIds?: bigint[],
  ): Promise<DatosFuncionario[]> {
    const where: Record<string, unknown> = {
      fecha_fin: null,
      // Los civiles no ascienden por la escala militar.
      personas: { es_civil: false },
    };

    if (personaIds?.length) where['persona_id'] = { in: personaIds };
    if (query.escalafon_id) where['escalafon_id'] = BigInt(query.escalafon_id);
    if (query.grado_id) where['grado_id'] = BigInt(query.grado_id);
    if (query.unidad_id) where['unidad_id'] = BigInt(query.unidad_id);

    if (alcance?.tipo === 'unidad') {
      where['unidad_id'] = { in: alcance.unidadIds.map((id) => BigInt(id)) };
    }

    if (query.query) {
      where['personas'] = {
        es_civil: false,
        OR: [
          { cedula: { contains: query.query, mode: 'insensitive' } },
          { primer_nombre: { contains: query.query, mode: 'insensitive' } },
          { primer_apellido: { contains: query.query, mode: 'insensitive' } },
          { segundo_apellido: { contains: query.query, mode: 'insensitive' } },
        ],
      };
    }

    const relaciones = await this.prisma.relaciones_laborales.findMany({
      where: where as never,
      select: {
        id: true,
        fecha_inicio: true,
        fecha_ultimo_ascenso: true,
        mutaciones: true,
        anios_servicio_anterior: true,
        personas: {
          select: {
            id: true,
            cedula: true,
            primer_nombre: true,
            primer_apellido: true,
            fecha_nacimiento: true,
          },
        },
        grados: { select: { id: true, codigo: true, denominacion: true, orden: true } },
        situaciones: { select: { id: true, codigo: true, denominacion: true } },
        unidades: { select: { id: true, denominacion: true } },
        escalafones: { select: { id: true, denominacion: true } },
      },
    });

    if (relaciones.length === 0) return [];

    const idsDePersonas = relaciones.map((r) => r.personas.id);

    const [cursos, legajos, retiros] = await Promise.all([
      this.prisma.funcionarios_cursos.findMany({
        where: { persona_id: { in: idsDePersonas } },
        select: {
          persona_id: true,
          curso_id: true,
          aprobado: true,
          dado_de_baja: true,
        },
      }),
      this.prisma.legajo_militar.findMany({
        where: { persona_id: { in: idsDePersonas } },
        select: { persona_id: true, nivel_educativo: true, fecha_egreso_eta: true },
      }),
      this.prisma.retiros.findMany({
        where: { persona_id: { in: idsDePersonas }, anulado: false },
        select: { persona_id: true, fecha_retiro: true },
      }),
    ]);

    const cursosPorPersona = new Map<
      string,
      Map<string, { aprobado: boolean | null; dado_de_baja: boolean }>
    >();
    for (const c of cursos) {
      const clave = c.persona_id.toString();
      const mapa = cursosPorPersona.get(clave) ?? new Map();
      mapa.set(c.curso_id.toString(), {
        aprobado: c.aprobado,
        dado_de_baja: c.dado_de_baja,
      });
      cursosPorPersona.set(clave, mapa);
    }

    const legajoPorPersona = new Map(legajos.map((l) => [l.persona_id.toString(), l]));
    const retiroPorPersona = new Map(
      retiros
        .filter((r) => r.persona_id != null)
        .map((r) => [r.persona_id!.toString(), r]),
    );

    return relaciones.map((r) => {
      const clave = r.personas.id.toString();
      return {
        persona: {
          id: clave,
          cedula: r.personas.cedula,
          nombre: r.personas.primer_nombre,
          apellido: r.personas.primer_apellido,
          fecha_nacimiento: r.personas.fecha_nacimiento,
        },
        relacion: {
          id: r.id.toString(),
          fecha_inicio: r.fecha_inicio,
          fecha_ultimo_ascenso: r.fecha_ultimo_ascenso,
          mutaciones: r.mutaciones,
          anios_servicio_anterior: r.anios_servicio_anterior ?? 0,
        },
        grado: {
          id: r.grados.id.toString(),
          codigo: r.grados.codigo,
          denominacion: r.grados.denominacion,
          orden: r.grados.orden,
        },
        situacion: r.situaciones
          ? {
              id: r.situaciones.id.toString(),
              codigo: r.situaciones.codigo,
              denominacion: r.situaciones.denominacion,
            }
          : null,
        unidad: r.unidades
          ? { id: r.unidades.id.toString(), denominacion: r.unidades.denominacion }
          : null,
        escalafon: r.escalafones
          ? { id: r.escalafones.id.toString(), denominacion: r.escalafones.denominacion }
          : null,
        legajo: legajoPorPersona.get(clave)
          ? {
              nivel_educativo: legajoPorPersona.get(clave)!.nivel_educativo,
              fecha_egreso_eta: legajoPorPersona.get(clave)!.fecha_egreso_eta,
            }
          : null,
        cursos: cursosPorPersona.get(clave) ?? new Map(),
        retiro: retiroPorPersona.get(clave)
          ? { fecha_retiro: retiroPorPersona.get(clave)!.fecha_retiro }
          : null,
      };
    });
  }

  /** Del formato del editor (ids de curso) al del motor (nombres, para explicar). */
  private async requisitosDesdeDto(
    requisitos: SimularImpactoDto['requisitos'] & object,
  ): Promise<ReglaEvaluable['requisitos']> {
    const ids = [...new Set(requisitos.flatMap((r) => r.cursos_ids ?? []))];
    const cursos = ids.length
      ? await this.prisma.cursos.findMany({
          where: { id: { in: ids.map((i) => BigInt(i)) } },
          select: { id: true, nombre_curso: true },
        })
      : [];
    const porId = new Map(cursos.map((c) => [c.id.toString(), c.nombre_curso]));

    return requisitos.map((r, i) => ({
      tipo: r.tipo,
      descripcion: r.descripcion,
      modo: r.modo ?? 'TODOS',
      aplica_si: r.aplica_si ?? ['SIEMPRE'],
      parametros: (r.parametros as Record<string, unknown>) ?? null,
      orden: r.orden ?? i + 1,
      cursos: (r.cursos_ids ?? []).map((id) => ({
        id: String(id),
        nombre: porId.get(String(id)) ?? `Curso ${id}`,
      })),
    }));
  }

  /** Reglas vigentes y activas, indexadas por grado de origen. */
  private async cargarReglas(): Promise<Map<string, ReglaEvaluable>> {
    const reglas = await this.prisma.ascensos_reglas.findMany({
      where: { activo: true, vigente_hasta: null },
      include: {
        grado_destino: { select: { id: true, codigo: true, denominacion: true, orden: true } },
        requisitos: {
          orderBy: { orden: 'asc' },
          include: { cursos: { include: { curso: { select: { id: true, nombre_curso: true } } } } },
        },
      },
    });

    return new Map(
      reglas.map((r) => [r.grado_origen_id.toString(), this.mapReglaEvaluable(r)]),
    );
  }

  private async cargarRegla(id: bigint): Promise<ReglaEvaluable | null> {
    const regla = await this.prisma.ascensos_reglas.findUnique({
      where: { id },
      include: {
        grado_destino: { select: { id: true, codigo: true, denominacion: true, orden: true } },
        requisitos: {
          orderBy: { orden: 'asc' },
          include: { cursos: { include: { curso: { select: { id: true, nombre_curso: true } } } } },
        },
      },
    });
    return regla ? this.mapReglaEvaluable(regla) : null;
  }

  private mapReglaEvaluable(regla: {
    id: bigint;
    nombre: string;
    grado_origen_id: bigint;
    dias_minimos: number;
    edad_maxima: number | null;
    grado_destino: { id: bigint; codigo: string; denominacion: string; orden: number };
    requisitos: {
      tipo: string;
      descripcion: string;
      modo: string;
      aplica_si: string[];
      parametros: unknown;
      orden: number;
      cursos: { curso: { id: bigint; nombre_curso: string | null } }[];
    }[];
  }): ReglaEvaluable {
    return {
      id: regla.id.toString(),
      nombre: regla.nombre,
      grado_origen_id: regla.grado_origen_id.toString(),
      dias_minimos: regla.dias_minimos,
      edad_maxima: regla.edad_maxima,
      grado_destino: {
        id: regla.grado_destino.id.toString(),
        codigo: regla.grado_destino.codigo,
        denominacion: regla.grado_destino.denominacion,
        orden: regla.grado_destino.orden,
      },
      requisitos: regla.requisitos.map((req) => ({
        tipo: req.tipo,
        descripcion: req.descripcion,
        modo: req.modo,
        aplica_si: req.aplica_si,
        parametros: (req.parametros as Record<string, unknown>) ?? null,
        orden: req.orden,
        cursos: req.cursos.map((c) => ({
          id: c.curso.id.toString(),
          nombre: c.curso.nombre_curso ?? `Curso ${c.curso.id}`,
        })),
      })),
    };
  }

  // ─── Auxiliares ───────────────────────────────────────────────────────────

  private fechaDeReferencia(valor?: string): Date {
    return inicioDelDia(valor ? new Date(valor) : new Date());
  }

  private contarPorEstado(evaluados: ResultadoElegibilidad[]) {
    const conteo = {
      PASIBLE: 0,
      PROXIMO: 0,
      BLOQUEADO: 0,
      FUERA_DE_EDAD: 0,
      SIN_REGLA: 0,
      TOPE_DE_ESCALA: 0,
    };
    for (const e of evaluados) conteo[e.estado]++;
    return conteo;
  }
}

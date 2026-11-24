import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { etiquetaPeriodo } from '../vuelos/vuelos.service';

export type TipoNombre =
  | 'persona' | 'rol' | 'permiso' | 'usuario' | 'sub_unidad' | 'unidad' | 'grado'
  | 'escalafon' | 'regimen' | 'situacion' | 'programa' | 'motivo_baja' | 'comision'
  | 'asignacion_comision' | 'asignacion_mision' | 'mision' | 'convocatoria' | 'curso' | 'modulo' | 'designacion'
  | 'unidad_vuelo' | 'periodo_vuelo' | 'registro_vuelo' | 'retiro' | 'ascenso'
  | 'orden_ascenso' | 'regla_ascenso' | 'destino' | 'invitacion' | 'documento_persona';

// Clave del detalle y la tabla a la que apunta
export const TIPO_POR_CLAVE: Record<string, TipoNombre> = {
  persona_id: 'persona', personaId: 'persona', persona_ids: 'persona', personaIds: 'persona',
  familiar_id: 'persona', familiarId: 'persona',
  rol_id: 'rol', rolId: 'rol', rol_ids: 'rol',
  permiso_id: 'permiso', permisoId: 'permiso', permiso_ids: 'permiso',
  usuario_id: 'usuario', usuarioId: 'usuario',
  sub_unidad_id: 'sub_unidad', subUnidadId: 'sub_unidad', sub_unidad_ids: 'sub_unidad', unidadIds: 'sub_unidad',
  unidad_id: 'unidad', unidadId: 'unidad',
  grado_id: 'grado', gradoId: 'grado', grado_reincorporacion_id: 'grado', grado_anterior_id: 'grado',
  grado_origen_id: 'grado', grado_destino_id: 'grado',
  escalafon_id: 'escalafon', escalafonId: 'escalafon',
  regimen_id: 'regimen', regimenId: 'regimen',
  situacion_id: 'situacion', situacionId: 'situacion',
  programa_id: 'programa', programaId: 'programa',
  motivo_baja_id: 'motivo_baja', motivoBajaId: 'motivo_baja',
  comision_id: 'comision', comisionId: 'comision',
  mision_id: 'mision', misionId: 'mision',
  convocatoria_id: 'convocatoria', convocatoriaId: 'convocatoria',
  curso_id: 'curso', cursoId: 'curso',
  modulo_id: 'modulo', moduloId: 'modulo', modulo_ids: 'modulo',
  designacion_id: 'designacion', designacionId: 'designacion',
  unidad_vuelo_id: 'unidad_vuelo', unidadVueloId: 'unidad_vuelo',
  periodo_id: 'periodo_vuelo', periodoId: 'periodo_vuelo',
  registro_id: 'registro_vuelo', registroId: 'registro_vuelo',
  retiro_id: 'retiro', retiroId: 'retiro',
  ascenso_id: 'ascenso', ascensoId: 'ascenso',
  orden_ascenso_id: 'orden_ascenso', ordenId: 'orden_ascenso',
  regla_id: 'regla_ascenso', reglaId: 'regla_ascenso',
  destino_id: 'destino', destinoId: 'destino',
  invitacion_id: 'invitacion', invitacionId: 'invitacion',
};

export interface EntidadAuditada {
  tipo?: TipoNombre;
  // Params que identifican la entidad, en orden
  params?: string[];
  // No usar entidadId si apunta a otra cosa
  soloParams?: boolean;
  articulo: 'el' | 'la';
  // El nombre es de una persona: "el retiro de Sgto. X"
  dePersona?: boolean;
  // Sin tabla propia, el nombre se arma con los params
  partes?: string[][];
}

export const ENTIDADES: Record<string, EntidadAuditada> = {
  Persona: { tipo: 'persona', params: ['id'], articulo: 'la' },
  Subalterno: { tipo: 'persona', params: ['id'], articulo: 'el' },
  Familiar: { tipo: 'persona', params: ['familiarId'], soloParams: true, articulo: 'el' },
  'Foto de personal': { tipo: 'persona', params: ['id'], articulo: 'la', dePersona: true },
  'Legajo militar': { tipo: 'persona', params: ['id'], articulo: 'el', dePersona: true },
  'Documento de personal': { tipo: 'documento_persona', params: ['id'], articulo: 'el' },
  Rol: { tipo: 'rol', params: ['id'], articulo: 'el' },
  Usuario: { tipo: 'usuario', params: ['id'], articulo: 'el' },
  Invitación: { tipo: 'invitacion', params: ['id'], articulo: 'la' },
  Misión: { tipo: 'mision', params: ['misionId'], articulo: 'la' },
  Convocatoria: { tipo: 'convocatoria', params: ['convocatoriaId'], articulo: 'la' },
  'Asignación a misión': { articulo: 'la', dePersona: true, partes: [['personaId'], ['convocatoriaId', 'misionId']] },
  'Documento de convocatoria': { tipo: 'convocatoria', params: ['id'], articulo: 'el', dePersona: true },
  'Documento de asignación a misión': { tipo: 'asignacion_mision', params: ['id'], articulo: 'el', dePersona: true },
  Curso: { tipo: 'curso', params: ['cursoId', 'id'], articulo: 'el' },
  'Designación de curso': { tipo: 'designacion', params: ['designacionId'], soloParams: true, articulo: 'la', dePersona: true },
  'Módulo de curso': { tipo: 'modulo', params: ['moduloId'], articulo: 'el' },
  'Completación de módulo': { tipo: 'modulo', params: ['moduloId'], soloParams: true, articulo: 'la' },
  'Calificación de curso': { tipo: 'curso', params: ['cursoId'], soloParams: true, articulo: 'la' },
  'Documento de designación': { tipo: 'designacion', params: ['id'], soloParams: true, articulo: 'el', dePersona: true },
  'Historial de curso': { tipo: 'designacion', params: ['id'], articulo: 'el', dePersona: true },
  Retiro: { tipo: 'retiro', params: ['retiroId'], articulo: 'el', dePersona: true },
  Reincorporación: { tipo: 'retiro', params: ['retiroId'], articulo: 'la', dePersona: true },
  'Documento de retiro': { tipo: 'retiro', params: ['id'], articulo: 'el', dePersona: true },
  Destino: { tipo: 'destino', params: ['destinoId'], articulo: 'el', dePersona: true },
  'Documento de destino': { tipo: 'destino', params: ['id'], articulo: 'el', dePersona: true },
  Comisión: { tipo: 'comision', params: ['id'], articulo: 'la' },
  'Asignación de comisión': { tipo: 'asignacion_comision', params: ['id'], articulo: 'la', dePersona: true },
  'Período de vuelo': { tipo: 'periodo_vuelo', params: ['periodoId'], articulo: 'el' },
  'Registro de vuelo': { tipo: 'registro_vuelo', params: ['registroId'], articulo: 'el', dePersona: true },
  'Unidad de vuelo': { tipo: 'unidad_vuelo', params: ['unidadId', 'id'], articulo: 'la' },
  Base: { tipo: 'sub_unidad', params: ['subUnidadId'], articulo: 'la' },
  Unidad: { tipo: 'sub_unidad', params: ['id'], articulo: 'la' },
  Comando: { tipo: 'unidad', params: ['unidadId'], articulo: 'el' },
  Ascenso: { tipo: 'ascenso', params: ['ascensoId'], articulo: 'el', dePersona: true },
  'Orden de ascenso': { tipo: 'orden_ascenso', params: ['id'], articulo: 'la' },
  'Documento de orden de ascenso': { tipo: 'orden_ascenso', params: ['id'], articulo: 'el', dePersona: true },
  'Regla de ascenso': { tipo: 'regla_ascenso', params: ['id'], articulo: 'la' },
  Reporte: { articulo: 'el' },
  Derecha: { articulo: 'la' },
  Numor: { articulo: 'el' },
};

// Si no está en el mapa el artículo sale por la terminación
export function configEntidad(entidad: string): EntidadAuditada {
  const conocida = ENTIDADES[entidad];
  if (conocida) return conocida;
  const primera = entidad.toLowerCase().split(' ')[0];
  const femenina = /(a|ión|dad)$/.test(primera);
  return { articulo: femenina ? 'la' : 'el' };
}

type Prisma = PrismaService;
type Resolutor = (ids: bigint[], prisma: Prisma) => Promise<Map<string, string>>;

// Para armar "Grado Nombre Apellido" con la relación más reciente
export const SELECT_NOMBRE_PERSONA = {
  id: true,
  primer_nombre: true,
  primer_apellido: true,
  relaciones_laborales: {
    orderBy: [{ fecha_inicio: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: { grados: { select: { denominacion: true } } },
  },
};

export interface PersonaConGrado {
  primer_nombre: string;
  primer_apellido: string;
  relaciones_laborales?: { grados: { denominacion: string } | null }[];
}

export function nombrePersona(p: PersonaConGrado | null | undefined): string | null {
  if (!p) return null;
  const grado = p.relaciones_laborales?.[0]?.grados?.denominacion;
  return [grado, p.primer_nombre, p.primer_apellido].filter(Boolean).join(' ');
}

const aMapa = <T extends { id: bigint }>(filas: T[], nombre: (f: NoInfer<T>) => string | null | undefined) => {
  const mapa = new Map<string, string>();
  for (const f of filas) {
    const n = nombre(f);
    if (n) mapa.set(f.id.toString(), n);
  }
  return mapa;
};

const enIds = (ids: bigint[]) => ({ id: { in: ids } });
const porDenominacion = { id: true, denominacion: true } as const;
const conDenominacion = (f: { denominacion: string }) => f.denominacion;
// "Antártida 2026 (orden 12/2026)"; la foto de convocatoria usa el mismo.
export function nombreConvocatoria(c: { numero_orden: string | null; misiones: { nombre_mision: string | null } | null }) {
  const mision = c.misiones?.nombre_mision ?? 'Convocatoria';
  return c.numero_orden ? `${mision} (orden ${c.numero_orden})` : mision;
}

const personaEn = (p: PersonaConGrado | null, lugar?: string | null) =>
  [nombrePersona(p), lugar].filter(Boolean).join(' en ') || null;

const RESOLUTORES: Record<TipoNombre, Resolutor> = {
  persona: async (ids, p) =>
    aMapa(await p.personas.findMany({ where: enIds(ids), select: SELECT_NOMBRE_PERSONA }), nombrePersona),
  rol: async (ids, p) =>
    aMapa(await p.roles.findMany({ where: enIds(ids), select: { id: true, nombre: true } }), (f) => f.nombre),
  permiso: async (ids, p) =>
    aMapa(
      await p.permisos.findMany({ where: enIds(ids), select: { id: true, nombre: true, descripcion: true } }),
      (f) => f.descripcion ?? f.nombre,
    ),
  usuario: async (ids, p) =>
    aMapa(await p.usuarios.findMany({ where: enIds(ids), select: { id: true, username: true } }), (f) => f.username),
  sub_unidad: async (ids, p) =>
    aMapa(await p.sub_unidades.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  unidad: async (ids, p) =>
    aMapa(await p.unidades.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  grado: async (ids, p) =>
    aMapa(await p.grados.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  escalafon: async (ids, p) =>
    aMapa(await p.escalafones.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  regimen: async (ids, p) =>
    aMapa(await p.regimenes.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  situacion: async (ids, p) =>
    aMapa(await p.situaciones.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  programa: async (ids, p) =>
    aMapa(await p.programas.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  motivo_baja: async (ids, p) =>
    aMapa(await p.motivos_baja.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  comision: async (ids, p) =>
    aMapa(await p.comisiones.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  unidad_vuelo: async (ids, p) =>
    aMapa(await p.unidades_vuelo.findMany({ where: enIds(ids), select: porDenominacion }), conDenominacion),
  asignacion_comision: async (ids, p) =>
    aMapa(
      await p.asignaciones_comision.findMany({
        where: enIds(ids),
        select: { id: true, personas: { select: SELECT_NOMBRE_PERSONA }, comisiones: { select: { denominacion: true } } },
      }),
      (f) => personaEn(f.personas, f.comisiones?.denominacion),
    ),
  mision: async (ids, p) =>
    aMapa(await p.misiones.findMany({ where: enIds(ids), select: { id: true, nombre_mision: true } }), (f) => f.nombre_mision),
  convocatoria: async (ids, p) =>
    aMapa(
      await p.convocatorias.findMany({
        where: enIds(ids),
        select: { id: true, numero_orden: true, misiones: { select: { nombre_mision: true } } },
      }),
      nombreConvocatoria,
    ),
  asignacion_mision: async (ids, p) =>
    aMapa(
      await p.funcionarios_convocatorias.findMany({
        where: enIds(ids),
        select: {
          id: true,
          personas: { select: SELECT_NOMBRE_PERSONA },
          convocatorias: { select: { numero_orden: true, misiones: { select: { nombre_mision: true } } } },
        },
      }),
      (f) => personaEn(f.personas, f.convocatorias ? nombreConvocatoria(f.convocatorias) : null),
    ),
  curso: async (ids, p) =>
    aMapa(await p.cursos.findMany({ where: enIds(ids), select: { id: true, nombre_curso: true } }), (f) => f.nombre_curso),
  modulo: async (ids, p) =>
    aMapa(await p.modulos_curso.findMany({ where: enIds(ids), select: { id: true, nombre_modulo: true } }), (f) => f.nombre_modulo),
  designacion: async (ids, p) =>
    aMapa(
      await p.funcionarios_cursos.findMany({
        where: enIds(ids),
        select: { id: true, personas: { select: SELECT_NOMBRE_PERSONA }, cursos: { select: { nombre_curso: true } } },
      }),
      (f) => personaEn(f.personas, f.cursos?.nombre_curso),
    ),
  periodo_vuelo: async (ids, p) =>
    aMapa(await p.periodos_vuelo.findMany({ where: enIds(ids), select: { id: true, anio: true, numero: true } }), etiquetaPeriodo),
  registro_vuelo: async (ids, p) =>
    aMapa(
      await p.registros_vuelo.findMany({
        where: enIds(ids),
        select: { id: true, personas: { select: SELECT_NOMBRE_PERSONA }, periodos_vuelo: { select: { anio: true, numero: true } } },
      }),
      (f) => [nombrePersona(f.personas), f.periodos_vuelo ? `(${etiquetaPeriodo(f.periodos_vuelo)})` : null]
        .filter(Boolean).join(' ') || null,
    ),
  retiro: async (ids, p) =>
    aMapa(
      await p.retiros.findMany({ where: enIds(ids), select: { id: true, personas: { select: SELECT_NOMBRE_PERSONA } } }),
      (f) => nombrePersona(f.personas),
    ),
  ascenso: async (ids, p) =>
    aMapa(
      await p.ascensos.findMany({
        where: enIds(ids),
        select: {
          id: true,
          personas: { select: { primer_nombre: true, primer_apellido: true } },
          grados_grado_anterior: { select: { denominacion: true } },
          grados: { select: { denominacion: true } },
        },
      }),
      (f) => {
        if (!f.personas) return null;
        const desde = f.grados_grado_anterior?.denominacion;
        const quien = [desde, f.personas.primer_nombre, f.personas.primer_apellido].filter(Boolean).join(' ');
        return f.grados ? `${quien} a ${f.grados.denominacion}` : quien;
      },
    ),
  orden_ascenso: async (ids, p) =>
    aMapa(
      await p.ascensos_ordenes.findMany({ where: enIds(ids), select: { id: true, numero_orden: true } }),
      (f) => f.numero_orden,
    ),
  regla_ascenso: async (ids, p) =>
    aMapa(await p.ascensos_reglas.findMany({ where: enIds(ids), select: { id: true, nombre: true } }), (f) => f.nombre),
  destino: async (ids, p) =>
    aMapa(
      await p.destinos.findMany({
        where: enIds(ids),
        select: {
          id: true,
          personas: { select: SELECT_NOMBRE_PERSONA },
          sub_unidades: { select: { denominacion: true } },
          unidades: { select: { denominacion: true } },
        },
      }),
      (f) => personaEn(f.personas, f.sub_unidades?.denominacion ?? f.unidades?.denominacion),
    ),
  invitacion: async (ids, p) =>
    aMapa(await p.invitaciones.findMany({ where: enIds(ids), select: { id: true, email: true } }), (f) => f.email),
  documento_persona: async (ids, p) =>
    aMapa(
      await p.personas_documentos.findMany({
        where: enIds(ids),
        select: { id: true, archivos: { select: { nombre_original: true } } },
      }),
      (f) => f.archivos?.nombre_original,
    ),
};

export interface EventoParaNombrar {
  entidad: string | null;
  entidadId: string | null;
  detalle: unknown;
}

export interface NombresEvento {
  nombres: Record<string, string>;
  entidadNombre: string | null;
}

interface Referencia {
  clave: string;
  valor: string;
  tipo: TipoNombre;
}

const MAX_PROFUNDIDAD = 6;
// Ya vienen legibles
const CLAVES_LEGIBLES = new Set(['cambios', 'anterior', 'descripcion']);

const esId = (v: unknown): v is string | number | bigint =>
  (typeof v === 'number' && Number.isInteger(v) && v > 0) ||
  typeof v === 'bigint' ||
  (typeof v === 'string' && /^\d{1,18}$/.test(v));

function recolectar(valor: unknown, refs: Referencia[], profundidad = 0) {
  if (profundidad > MAX_PROFUNDIDAD || valor === null || typeof valor !== 'object') return;
  if (Array.isArray(valor)) {
    for (const v of valor) recolectar(v, refs, profundidad + 1);
    return;
  }
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (CLAVES_LEGIBLES.has(clave)) continue;
    const tipo = TIPO_POR_CLAVE[clave];
    if (tipo) {
      const lista = Array.isArray(v) ? v : [v];
      for (const x of lista) if (esId(x)) refs.push({ clave, valor: String(x), tipo });
    }
    if (typeof v === 'object') recolectar(v, refs, profundidad + 1);
  }
}

const comoObjeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

// Id de la entidad: primero los params, después entidadId
export function idDeEntidad(evento: EventoParaNombrar): { tipo: TipoNombre; id: string } | null {
  if (!evento.entidad) return null;
  const cfg = ENTIDADES[evento.entidad];
  if (!cfg?.tipo) return null;
  const params = comoObjeto(comoObjeto(evento.detalle).params);
  for (const clave of cfg.params ?? []) {
    const v = params[clave];
    if (esId(v)) return { tipo: cfg.tipo, id: String(v) };
  }
  if (cfg.soloParams || !evento.entidadId || !esId(evento.entidadId)) return null;
  return { tipo: cfg.tipo, id: evento.entidadId };
}

// Nombre de una entidad sin tabla propia
function nombrePorPartes(evento: EventoParaNombrar, nombres: Record<string, string>): string | null {
  const partes = evento.entidad ? ENTIDADES[evento.entidad]?.partes : undefined;
  if (!partes) return null;
  const params = comoObjeto(comoObjeto(evento.detalle).params);
  const textos = partes.map((claves) => {
    for (const clave of claves) {
      const nombre = esId(params[clave]) ? nombres[`${clave}:${String(params[clave])}`] : undefined;
      if (nombre) return nombre;
    }
    return null;
  });
  // Si falta una parte no se arma el nombre
  return textos.every(Boolean) ? textos.join(' en ') : null;
}

@Injectable()
export class AuditoriaNombres {
  private readonly logger = new Logger(AuditoriaNombres.name);

  constructor(private readonly prisma: PrismaService) {}

  // Una consulta por tipo de id para todos los eventos
  async resolver(eventos: EventoParaNombrar[]): Promise<NombresEvento[]> {
    const refsPorEvento = eventos.map((e) => {
      const refs: Referencia[] = [];
      const detalle = comoObjeto(e.detalle);
      recolectar(detalle, refs);
      // El id de la ruta depende de la entidad del evento.
      const params = comoObjeto(detalle.params);
      const tipoId = e.entidad ? ENTIDADES[e.entidad]?.tipo : undefined;
      if (tipoId && esId(params.id)) refs.push({ clave: 'id', valor: String(params.id), tipo: tipoId });
      return refs;
    });
    const entidades = eventos.map(idDeEntidad);

    const idsPorTipo = new Map<TipoNombre, Set<string>>();
    const agregar = (tipo: TipoNombre, id: string) => {
      if (!idsPorTipo.has(tipo)) idsPorTipo.set(tipo, new Set());
      idsPorTipo.get(tipo)!.add(id);
    };
    refsPorEvento.flat().forEach((r) => agregar(r.tipo, r.valor));
    entidades.forEach((e) => e && agregar(e.tipo, e.id));

    const resueltos = new Map<TipoNombre, Map<string, string>>();
    await Promise.all(
      [...idsPorTipo].map(async ([tipo, ids]) => {
        try {
          resueltos.set(tipo, await RESOLUTORES[tipo]([...ids].map((i) => BigInt(i)), this.prisma));
        } catch (error) {
          // Si falla un tipo los demás salen igual
          const mensaje = error instanceof Error ? error.message : String(error);
          this.logger.warn(`No se pudieron resolver nombres de ${tipo}: ${mensaje}`);
        }
      }),
    );

    return eventos.map((_, i) => {
      const nombres: Record<string, string> = {};
      for (const r of refsPorEvento[i]) {
        const nombre = resueltos.get(r.tipo)?.get(r.valor);
        if (nombre) nombres[`${r.clave}:${r.valor}`] = nombre;
      }
      const ent = entidades[i];
      const entidadNombre = ent
        ? resueltos.get(ent.tipo)?.get(ent.id) ?? null
        : nombrePorPartes(eventos[i], nombres);
      return { nombres, entidadNombre };
    });
  }
}

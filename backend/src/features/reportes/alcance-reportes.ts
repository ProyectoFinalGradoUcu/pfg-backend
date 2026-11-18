/**
 * Qué reportes y qué fuentes saben acotarse a una unidad.
 *
 * Un reporte que no aplica el filtro devuelve el padrón completo de la fuerza aunque los listados
 * de la aplicación estén correctamente segmentados, y lo hace en silencio. Por eso la lista es
 * explícita y por inclusión: un reporte nuevo queda bloqueado bajo alcance de unidad hasta que
 * alguien lo revise y lo agregue acá a conciencia.
 *
 * Criterio para estar en la lista: la definición tiene que aplicar `FILTRO_ALCANCE_BASES` en su
 * `where` (con `basesDeAlcance`). Ver spec 002 §3 "Reportes".
 */

/**
 * Filtro que agrega el service con las bases del usuario (ids separados por coma). No es un
 * parámetro del reporte: si llega en el pedido se descarta.
 */
export const FILTRO_ALCANCE_BASES = 'alcance_sub_unidad_ids';

/** Bases del filtro de alcance, o `undefined` si no hay alcance de unidad. */
export function basesDeAlcance(
  filtros: Record<string, string | undefined>,
): bigint[] | undefined {
  const valor = filtros[FILTRO_ALCANCE_BASES];
  if (valor === undefined) return undefined;
  return valor
    .split(',')
    .filter(Boolean)
    .map((id) => BigInt(id));
}

export function whereRelacionPorAlcance(filtros: Record<string, string | undefined>) {
  const bases = basesDeAlcance(filtros);
  return bases ? { sub_unidad_id: { in: bases } } : {};
}

/** Base elegida en el filtro del reporte (`sub_unidad_id`), o `undefined`. */
export function baseDeFiltros(filtros: Record<string, string | undefined>): bigint | undefined {
  const valor = filtros.sub_unidad_id?.trim();
  return valor && /^\d+$/.test(valor) ? BigInt(valor) : undefined;
}

/**
 * Condición sobre `relaciones_laborales.sub_unidad_id` que junta la base elegida en el filtro
 * con el alcance del usuario. Con alcance de unidad, una base ajena no trae nada.
 */
export function whereRelacionPorBase(filtros: Record<string, string | undefined>) {
  const elegida = baseDeFiltros(filtros);
  const bases = basesDeAlcance(filtros);
  if (elegida === undefined) return bases ? { sub_unidad_id: { in: bases } } : {};
  if (bases && !bases.includes(elegida)) return { sub_unidad_id: { in: [] as bigint[] } };
  return { sub_unidad_id: elegida };
}

/** Historial visible solo si la persona pertenece actualmente a una base autorizada. */
export function wherePersonaReporte(filtros: Record<string, string | undefined>) {
  const bases = basesDeAlcance(filtros);
  return bases ? { relaciones_laborales: { some: { fecha_fin: null, sub_unidad_id: { in: bases } } } } : {};
}

/** Reportes de catálogo (`GET /reportes/:clave`) que se acotan a las bases del usuario. */
export const REPORTES_CON_ALCANCE_UNIDAD = new Set<string>([
  'compensacion-idoneidad',
  'movimientos-unidad',
  'pasibles-ascenso',
  'porcentaje-mujeres',
  'prima-tecnica',
  'ficha-personal',
  'destinos',
  'legajo-oficial',
  'misiones-oficiales',
  'resumen-fuerza-efectiva',
  'movimientos-personal',
]);

/** Fuentes de reportes personalizados que se acotan a las bases del usuario. */
export const FUENTES_CON_ALCANCE_UNIDAD = new Set<string>(['personal', 'misiones', 'destinos', 'ascensos']);

export const MENSAJE_REPORTE_SIN_ALCANCE =
  'Este reporte no puede acotarse a una unidad, así que solo está disponible con permiso de alcance general.';

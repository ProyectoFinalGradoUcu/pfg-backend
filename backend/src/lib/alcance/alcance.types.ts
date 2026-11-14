/**
 * Alcance de datos resuelto para el usuario autenticado en un endpoint concreto.
 *
 * - `global`: el usuario tiene el permiso base (ej. `personas.ver`) y opera sobre todos los registros.
 * - `unidad`: el usuario tiene la variante `.unidad` (ej. `personas.ver.unidad`) y solo opera sobre
 *   los registros de las bases (sub-unidades) que tiene asignadas. `comandoIds` son los comandos de
 *   esas bases.
 *
 * Ver spec 002 §3 "Permisos: alcance global vs alcance de unidad".
 */
export type AlcanceResuelto =
  | { tipo: 'global' }
  | { tipo: 'unidad'; subUnidadIds: string[]; comandoIds: string[] };

/** Sufijo que distingue la variante restringida de un permiso segmentable. */
export const SUFIJO_UNIDAD = '.unidad';

/** Devuelve el nombre del permiso restringido a partir del permiso base. */
export const permisoDeUnidad = (permisoBase: string): string =>
  `${permisoBase}${SUFIJO_UNIDAD}`;

/** Ids de las bases del usuario, o `null` si el alcance es global. */
export const subUnidadIdsDeAlcance = (alcance: AlcanceResuelto): bigint[] | null =>
  alcance.tipo === 'global'
    ? null
    : alcance.subUnidadIds.map((id) => BigInt(id));

/** Ids de los comandos de esas bases, o `null` si el alcance es global. */
export const comandoIdsDeAlcance = (alcance: AlcanceResuelto): bigint[] | null =>
  alcance.tipo === 'global'
    ? null
    : alcance.comandoIds.map((id) => BigInt(id));

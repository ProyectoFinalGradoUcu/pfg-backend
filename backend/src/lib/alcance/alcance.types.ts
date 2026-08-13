/**
 * Alcance de datos resuelto para el usuario autenticado en un endpoint concreto.
 *
 * - `global`: el usuario tiene el permiso base (ej. `personas.ver`) y opera sobre todos los registros.
 * - `unidad`: el usuario tiene la variante `.unidad` (ej. `personas.ver.unidad`) y solo opera sobre
 *   los registros de su unidad, que se deriva de su relación laboral activa.
 *
 * Ver spec 002 §3 "Permisos: alcance global vs alcance de unidad".
 */
export type AlcanceResuelto =
  | { tipo: 'global' }
  | { tipo: 'unidad'; unidadId: string };

/** Sufijo que distingue la variante restringida de un permiso segmentable. */
export const SUFIJO_UNIDAD = '.unidad';

/** Devuelve el nombre del permiso restringido a partir del permiso base. */
export const permisoDeUnidad = (permisoBase: string): string =>
  `${permisoBase}${SUFIJO_UNIDAD}`;

/**
 * `unidad_id` a forzar en las consultas, o `null` si el alcance es global.
 * Pensado para los services que ya arman su propio `where` y solo necesitan el valor.
 */
export const unidadIdDeAlcance = (alcance: AlcanceResuelto): bigint | null =>
  alcance.tipo === 'global' ? null : BigInt(alcance.unidadId);

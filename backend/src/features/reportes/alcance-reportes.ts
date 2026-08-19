/**
 * Qué reportes y qué fuentes saben acotarse a una unidad.
 *
 * Un reporte que no aplica el filtro devuelve el padrón completo de la fuerza aunque los listados
 * de la aplicación estén correctamente segmentados, y lo hace en silencio. Por eso la lista es
 * explícita y por inclusión: un reporte nuevo queda bloqueado bajo alcance de unidad hasta que
 * alguien lo revise y lo agregue acá a conciencia.
 *
 * Criterio para estar en la lista: la definición tiene que leer `filtros.unidad_id` y usarlo en
 * su `where`. Ver spec 002 §3 "Reportes".
 */

/** Reportes de catálogo (`GET /reportes/:clave`) que aceptan `unidad_id`. */
export const REPORTES_CON_ALCANCE_UNIDAD = new Set<string>([
  'compensacion-idoneidad',
  'movimientos-unidad',
  'porcentaje-mujeres',
  'prima-tecnica',
]);

/** Fuentes de reportes personalizados que aceptan `unidad_id`. */
export const FUENTES_CON_ALCANCE_UNIDAD = new Set<string>(['personal']);

export const MENSAJE_REPORTE_SIN_ALCANCE =
  'Este reporte no puede acotarse a una unidad, así que solo está disponible con permiso de alcance general.';

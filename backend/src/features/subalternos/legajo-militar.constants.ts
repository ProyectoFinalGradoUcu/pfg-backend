/** Nivel educativo civil del funcionario. Vive en `legajo_militar`. */
export const NIVELES_EDUCATIVOS = [
  'PRIMARIA',
  'CICLO_BASICO_INCOMPLETO',
  'CICLO_BASICO',
  'BACHILLERATO_INCOMPLETO',
  'BACHILLERATO',
  'BACHILLERATO_TECNOLOGICO',
  'TERCIARIO',
] as const;

export type NivelEducativo = (typeof NIVELES_EDUCATIVOS)[number];

export const ETIQUETAS_NIVEL_EDUCATIVO: Record<NivelEducativo, string> = {
  PRIMARIA: 'Primaria',
  CICLO_BASICO_INCOMPLETO: 'Ciclo básico incompleto',
  CICLO_BASICO: 'Ciclo básico',
  BACHILLERATO_INCOMPLETO: 'Bachillerato incompleto',
  BACHILLERATO: 'Bachillerato',
  BACHILLERATO_TECNOLOGICO: 'Bachillerato tecnológico (UTU)',
  TERCIARIO: 'Terciario',
};

/** Nivel liceal para las reglas de ascenso: ciclo básico completo o más. */
const NIVELES_LICEALES = new Set<string>([
  'CICLO_BASICO',
  'BACHILLERATO',
  'BACHILLERATO_TECNOLOGICO',
  'TERCIARIO',
]);

export const esNivelLiceal = (nivel: string | null | undefined): boolean =>
  nivel != null && NIVELES_LICEALES.has(nivel);

/**
 * Mutado = cambió de escalafón conservando el grado. Se lee de la columna
 * existente `relaciones_laborales.mutaciones`: con que tenga contenido, lo es.
 */
export const esMutado = (mutaciones: string | null | undefined): boolean =>
  mutaciones != null && mutaciones.trim().length > 0;

export const ESCALAS_DERECHA = ['OFICIALES', 'SUBALTERNOS'] as const;
export type EscalaDerecha = (typeof ESCALAS_DERECHA)[number];

export const NOMBRES_ESCALA: Record<EscalaDerecha, string> = {
  OFICIALES: 'Oficiales',
  SUBALTERNOS: 'Personal Subalterno',
};

export const TIPOS_HISTORIAL = ['DERECHA', 'NUMOR'] as const;
export type TipoHistorial = (typeof TIPOS_HISTORIAL)[number];

export const OPERACIONES_DERECHA = [
  'ALTA',
  'BAJA',
  'REORDEN',
  'ASCENSO',
  'CAMBIO_ESCALAFON',
] as const;
export type OperacionDerecha = (typeof OPERACIONES_DERECHA)[number];

/**
 * Cantidad máxima habitual de funcionarios en actividad por grado. Es un aviso,
 * no un bloqueo: la cantidad la define la orden de ascenso, no la derecha.
 */
export const TOPES_POR_GRADO: Record<string, number> = {
  GRAL: 1,
  BRIG_GRAL: 5,
};

/**
 * ANTIGUEDAD: fecha de ingreso al grado (último ascenso o, si nunca ascendió, inicio
 * de la relación). Los de la misma fecha son de la misma tanda y se desempatan por
 * egreso de la ETA.
 * EGRESO: solo por egreso de la ETA.
 * En los dos, el empate final mantiene el orden actual.
 */
export const CRITERIOS_SUGERENCIA = ['ANTIGUEDAD', 'EGRESO'] as const;
export type CriterioSugerencia = (typeof CRITERIOS_SUGERENCIA)[number];

/** Clave del lock de Postgres que serializa las operaciones de derecha y numor. */
export const LOCK_DERECHA = 7_310_001;

/**
 * Códigos de grado del catálogo de producción, que es del sistema de
 * liquidación: se lee, nunca se inserta ni se altera.
 */
export const GRADOS = {
  SDO_2DA: 'SDO_2DA',
  SDO_1RA: 'SDO_1RA',
  CBO_2DA: 'CBO_2DA',
  CBO_1RA: 'CBO_1RA',
  SGTO: 'SGTO',
  SGTO_1RO: 'SGTO_1RO',
  SOM: 'SOM',
  ALF: 'ALF',
  TTE_2DO: 'TTE_2DO',
  TTE_1RO: 'TTE_1RO',
  CAP: 'CAP',
  MAY: 'MAY',
  TTE_CNEL: 'TTE_CNEL',
  CNEL: 'CNEL',
  BRIG_GRAL: 'BRIG_GRAL',
  GRAL: 'GRAL',
  AT_2DA: 'AT_2DA',
  AT_1RA: 'AT_1RA',
  AT_PPAL: 'AT_PPAL',
  INST_AT: 'INST_AT',
  SUP_AT: 'SUP_AT',
} as const;

/** Al ascender acá se sella `fecha_ascenso_oficial`, base del progresivo 044.001. */
export const CODIGO_PRIMER_GRADO_OFICIAL = GRADOS.ALF;

/** Al ascender a Sgto. 1.º la prima técnica se vacía, igual que hace liquidación. */
export const CODIGO_GRADO_SIN_PRIMA_TECNICA = GRADOS.SGTO_1RO;

export const PRIMA_TECNICA_VACIA = 'VACIO';

/** Se buscan por nombre y nunca por id: el catálogo es del otro equipo. */
export const TIPO_MOVIMIENTO_CIERRE = 'Cambio de Situacion';
export const TIPO_MOVIMIENTO_ASCENSO = 'Ascenso';

/**
 * Espacio de nombres del advisory lock por persona (`pg_advisory_xact_lock(int, int)`).
 * El espacio de dos claves no se solapa con el de una sola que usa la derecha.
 */
export const LOCK_ASCENSO_PERSONA = 530_153;

/** Estados de `relaciones_laborales.estado` que usa liquidación. */
export const ESTADO_RELACION_ACTIVA = 'activo';
export const ESTADO_RELACION_INACTIVA = 'inactivo';

/**
 * Situaciones de actividad (superior y subalterno), incluidas las de reincorporado
 * (SIT16 y SIT17). Si un retiro previo bloquea lo decide la elegibilidad, no esta lista.
 */
export const SITUACIONES_ELEGIBLES_POR_DEFECTO = ['SIT01', 'SIT07', 'SIT16', 'SIT17'];

/**
 * Licencia sin goce de sueldo, no disponible, sueldo retenido y reserva de
 * cargo. Ley 19.775, arts. 69 y 108.
 */
export const SITUACIONES_BLOQUEANTES_POR_DEFECTO = [
  'SIT03',
  'SIT04',
  'SIT06',
  'SIT09',
  'SIT10',
  'SIT11',
];

// ─── Reglas de ascenso ──────────────────────────────────────────────────────

/** Tipos de requisito que entiende el motor. */
export const TIPOS_REQUISITO = ['CURSO_APROBADO', 'ANTIGUEDAD_SERVICIO'] as const;
export type TipoRequisito = (typeof TIPOS_REQUISITO)[number];

/** Cómo se combinan los cursos vinculados a un requisito. */
export const MODOS_REQUISITO = ['TODOS', 'ALGUNO'] as const;

/** Con que se cumpla una de estas, el requisito aplica a la persona. */
export const CONDICIONES_APLICACION = [
  'SIEMPRE',
  'ES_MUTADO',
  'NO_ES_MUTADO',
  'EGRESADO_ETA',
  'NO_EGRESADO_ETA',
  'NIVEL_LICEAL',
] as const;
export type CondicionAplicacion = (typeof CONDICIONES_APLICACION)[number];

/**
 * La escala agrupada por escalafón. Se arma con códigos de grado porque
 * `grados.escalafon_id` viene NULL en todo el catálogo de producción. Los
 * cadetes y aprendices quedan fuera: no forman parte de la escala de ascensos.
 */
export const ESCALERA_FAU = [
  {
    clave: 'SUBALTERNOS',
    nombre: 'Subalternos (SG y ST)',
    grados: [
      GRADOS.SDO_2DA,
      GRADOS.SDO_1RA,
      GRADOS.CBO_2DA,
      GRADOS.CBO_1RA,
      GRADOS.SGTO,
      GRADOS.SGTO_1RO,
      GRADOS.SOM,
    ],
  },
  {
    clave: 'AEROTECNICOS',
    nombre: 'Aerotécnicos (AT)',
    grados: [
      GRADOS.AT_2DA,
      GRADOS.AT_1RA,
      GRADOS.AT_PPAL,
      GRADOS.INST_AT,
      GRADOS.SUP_AT,
    ],
  },
  {
    clave: 'OFICIALES',
    nombre: 'Oficiales',
    grados: [
      GRADOS.ALF,
      GRADOS.TTE_2DO,
      GRADOS.TTE_1RO,
      GRADOS.CAP,
      GRADOS.MAY,
      GRADOS.TTE_CNEL,
      GRADOS.CNEL,
      GRADOS.BRIG_GRAL,
      GRADOS.GRAL,
    ],
  },
] as const;

/**
 * Cómo es un ascenso respecto de la escala:
 * - `SIGUIENTE`: al grado inmediato superior de la misma escala. El caso normal.
 * - `SALTO`: a un grado superior de la misma escala, salteando grados.
 * - `CAMBIO_ESCALA`: a otra escala, o desde/hacia un grado que no está en ninguna
 *   (cadetes, aprendices).
 * - `NO_SUPERIOR`: al mismo grado o a uno inferior de la misma escala. Nunca es un ascenso.
 *
 * `SALTO` y `CAMBIO_ESCALA` solo se registran como excepción, con motivo.
 */
export type TipoAscenso = 'SIGUIENTE' | 'SALTO' | 'CAMBIO_ESCALA' | 'NO_SUPERIOR';

export function clasificarAscenso(codigoActual: string, codigoDestino: string): TipoAscenso {
  const escala = ESCALERA_FAU.find((e) =>
    (e.grados as readonly string[]).includes(codigoActual),
  );
  const grados = (escala?.grados ?? []) as readonly string[];
  const desde = grados.indexOf(codigoActual);
  const hasta = grados.indexOf(codigoDestino);
  if (!escala || hasta < 0) return 'CAMBIO_ESCALA';
  if (hasta <= desde) return 'NO_SUPERIOR';
  return hasta === desde + 1 ? 'SIGUIENTE' : 'SALTO';
}

/** Código del grado siguiente de la misma escala, o null en el tope o fuera de escala. */
export function gradoSiguiente(codigoActual: string): string | null {
  for (const e of ESCALERA_FAU) {
    const grados = e.grados as readonly string[];
    const i = grados.indexOf(codigoActual);
    if (i >= 0) return grados[i + 1] ?? null;
  }
  return null;
}

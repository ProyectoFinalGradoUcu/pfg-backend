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

/** Estados de `relaciones_laborales.estado` que usa liquidación. */
export const ESTADO_RELACION_ACTIVA = 'activo';
export const ESTADO_RELACION_INACTIVA = 'inactivo';

/** Actividad de superior y de subalterno. Es un valor por defecto, no una regla fija. */
export const SITUACIONES_ELEGIBLES_POR_DEFECTO = ['SIT01', 'SIT07'];

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

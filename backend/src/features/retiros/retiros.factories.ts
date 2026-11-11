/**
 * Factories y mock de Prisma compartidos por los specs del módulo.
 *
 * Van en un archivo aparte y no en un `.spec.ts`: importar un spec desde otro
 * hace que Jest ejecute sus describes en las dos suites.
 */


export const makeMotivoBaja = (o: Partial<any> = {}) => ({
  id: 1n,
  codigo: 'RETIRO_OBL',
  denominacion: 'Baja por retiro obligatorio.',
  vigente: true,
  ...o,
});

export const makePersonaMin = (o: Partial<any> = {}) => ({
  id: 100n,
  cedula: '12345678',
  primer_nombre: 'José',
  primer_apellido: 'Pérez',
  es_civil: false,
  fecha_fallecimiento: null,
  // Vacío = la persona no volvió al servicio, o sea el retiro sigue en pie.
  relaciones_laborales: [],
  ...o,
});

export const makeRelacion = (o: Partial<any> = {}) => ({
  id: 45n,
  persona_id: 100n,
  unidad_id: 5n,
  situacion_id: 7n,
  grado_id: 3n,
  regimen_id: 1n,
  programa_id: 1n,
  escalafon_id: 2n,
  sub_unidad_id: null,
  estado: 'activo',
  tipo_funcionario: 'subalterno',
  fecha_inicio: new Date('2010-03-01'),
  fecha_fin: null,
  motivo_baja_id: null,
  anios_servicio_anterior: 7,
  grado_reincorporacion_id: null,
  haber_retiro: null,
  porcentaje_progresivo: null,
  fecha_ascenso_oficial: new Date('2015-06-01'),
  fecha_ultimo_ascenso: new Date('2022-01-15'),
  superprima: true,
  riesgo_vuelo: 1500,
  prima_tecnica: 'A',
  prima_solidaria_familiar: 'SI',
  anios_inactivos: 2,
  categoria_viatico: 3,
  usa_fonasa: true,
  observaciones: 'Observaciones de carrera',
  codigos_legajo: '-1-4-7-8-',
  unidades: { id: 5n, codigo: 'CG', denominacion: 'Cuartel General' },
  grados: { id: 3n, codigo: 'SG', denominacion: 'Sargento', es_oficial: false, es_subalterno: true },
  situaciones: { id: 7n, codigo: 'SIT07', denominacion: 'Personal Subalterno en actividad.' },
  escalafones: { id: 2n, codigo: 'SG', denominacion: '(S.G.)' },
  regimenes: { id: 1n, numero_ley: '19.695', denominacion: 'Ley 19.695' },
  programas: { id: 1n, codigo: '300', denominacion: 'Programa 300' },
  ...o,
});

export const makeGrado = (o: Partial<any> = {}) => ({
  id: 3n,
  codigo: 'SG',
  denominacion: 'Sargento',
  vigente: true,
  es_oficial: false,
  es_subalterno: true,
  ...o,
});

export const makeRetiro = (o: Partial<any> = {}) => ({
  id: 88n,
  persona_id: 100n,
  relacion_laboral_id: 45n,
  fecha_retiro: new Date('2026-08-28'),
  hora_retiro: null,
  motivo_baja_id: 1n,
  motivo: 'Pase a retiro',
  numero_orden: 'O.D. 12455',
  boletin: null,
  observaciones: null,
  movimiento_laboral_id: 410n,
  cierres_aplicados: {},
  registrado_por: 7n,
  registrado_en: new Date('2026-08-28T10:00:00Z'),
  anulado: false,
  motivo_anulacion: null,
  fecha_anulacion: null,
  anulado_por: null,
  personas: makePersonaMin(),
  motivos_baja: makeMotivoBaja(),
  relaciones_laborales: makeRelacion({ estado: 'inactivo', fecha_fin: new Date('2026-08-28') }),
  ...o,
});


export const makePrismaMock = () => ({
  retiros: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  personas: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  relaciones_laborales: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  motivos_baja: { findUnique: jest.fn(), findFirst: jest.fn() },
  situaciones: { findFirst: jest.fn() },
  tipos_movimiento: { findFirst: jest.fn() },
  movimientos_laborales: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  destinos: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn(), delete: jest.fn() },
  asignaciones_comision: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  historial_derecha_numor: { findFirst: jest.fn(), findMany: jest.fn() },
  ascensos: { count: jest.fn() },
  items_liquidacion: { count: jest.fn() },
  compensaciones_diferencia_ascenso: { count: jest.fn() },
  funcionarios_cursos: { findMany: jest.fn(), updateMany: jest.fn() },
  usuarios: { findFirst: jest.fn(), update: jest.fn() },
  ocupaciones_vivienda: { findFirst: jest.fn() },
  grados: { findUnique: jest.fn(), findMany: jest.fn() },
  unidades: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
});

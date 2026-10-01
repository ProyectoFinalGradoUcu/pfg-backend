import type { Prisma } from '@prisma/client';

/**
 * Qué le impide al admin borrar un funcionario. Las relaciones propias van con nombre; las
 * del sistema de liquidaciones, que no se tocan desde acá, se suman en una sola línea.
 */
export interface RegistroQueBloquea {
  tipo: string;
  etiqueta: string;
  cantidad: number;
}

/** Conteos por relación de `personas`, como los devuelve `_count`, más `retiros` (0 o 1). */
export type ConteosPersona = Partial<Record<string, number>>;

const PROPIOS: { tipo: string; etiqueta: string; campos: string[] }[] = [
  { tipo: 'documentos', etiqueta: 'Documentos', campos: ['personas_documentos'] },
  { tipo: 'cursos', etiqueta: 'Cursos', campos: ['funcionarios_cursos'] },
  { tipo: 'misiones', etiqueta: 'Misiones', campos: ['funcionarios_misiones'] },
  { tipo: 'convocatorias', etiqueta: 'Convocatorias', campos: ['funcionarios_convocatorias'] },
  { tipo: 'destinos', etiqueta: 'Destinos', campos: ['destinos'] },
  { tipo: 'ascensos', etiqueta: 'Ascensos', campos: ['ascensos'] },
  { tipo: 'retiro', etiqueta: 'Retiro', campos: ['retiros'] },
  { tipo: 'familiares', etiqueta: 'Vínculos familiares', campos: ['relaciones_familiares'] },
  { tipo: 'usuarios', etiqueta: 'Usuarios del sistema', campos: ['usuarios'] },
  { tipo: 'invitaciones', etiqueta: 'Invitaciones', campos: ['invitaciones'] },
];

const DE_LIQUIDACIONES = [
  'aguinaldo_baja',
  'aguinaldos',
  'beneficios_sociales',
  'compensaciones_diferencia_ascenso',
  'comp_personal_048018',
  'cuentas_bancarias',
  'dependientes',
  'descuentos_personal_periodo',
  'descuentos_personales',
  'fictos_persona',
  'form3100',
  'funcionarios_vuelos',
  'historico_liquidaciones',
  'incidencias_calculo',
  'irpf_mensual',
  'items_liquidacion',
  'items_lote_compensacion',
  'novedades_periodo',
  'ocupaciones_vivienda',
  'retroactividades',
] as const;

/**
 * `select` de `_count` con todo lo que bloquea. `relaciones_laborales` y `legajo_militar`
 * no están: se borran junto con la persona. De los documentos cuentan solo los activos;
 * los borrados son historial y se limpian con ella.
 *
 * Los vínculos familiares se cuentan aparte: Prisma arma el alias `_aggr_count_<relación>`
 * y Postgres corta los identificadores a 63 caracteres, así que con los nombres de esas
 * dos relaciones el alias llega truncado y la consulta entera falla.
 */
export const SELECT_CONTEO_BLOQUEOS = {
  personas_documentos: { where: { archivos: { eliminado_en: null } } },
  funcionarios_cursos: true,
  funcionarios_misiones: true,
  funcionarios_convocatorias: true,
  destinos: true,
  ascensos: true,
  usuarios: true,
  invitaciones: true,
  ...Object.fromEntries(DE_LIQUIDACIONES.map((campo) => [campo, true])),
} satisfies Prisma.PersonasCountOutputTypeSelect;

const sumar = (conteos: ConteosPersona, campos: readonly string[]) =>
  campos.reduce((total, campo) => total + (conteos[campo] ?? 0), 0);

export function describirBloqueos(conteos: ConteosPersona): RegistroQueBloquea[] {
  const registros = PROPIOS.map(({ tipo, etiqueta, campos }) => ({
    tipo,
    etiqueta,
    cantidad: sumar(conteos, campos),
  }));
  registros.push({
    tipo: 'liquidaciones',
    etiqueta: 'Registros de liquidaciones',
    cantidad: sumar(conteos, DE_LIQUIDACIONES),
  });
  return registros.filter((registro) => registro.cantidad > 0);
}

export function mensajeDeBloqueo(registros: RegistroQueBloquea[]): string {
  const partes = registros.map((r) => `${r.etiqueta.toLowerCase()} (${r.cantidad})`);
  const lista =
    partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0];
  return `No se puede eliminar: el funcionario tiene ${lista}`;
}

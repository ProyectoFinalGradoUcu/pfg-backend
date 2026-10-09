import type { Prisma } from '@prisma/client';

export interface RegistroQueBloquea {
  tipo: string;
  etiqueta: string;
  cantidad: number;
}

export type ConteosPersona = Partial<Record<string, number>>;

const PROPIOS: { tipo: string; etiqueta: string; campos: string[] }[] = [
  { tipo: 'documentos', etiqueta: 'Documentos', campos: ['personas_documentos'] },
  { tipo: 'cursos', etiqueta: 'Cursos', campos: ['funcionarios_cursos'] },
  { tipo: 'misiones', etiqueta: 'Misiones', campos: ['funcionarios_misiones'] },
  { tipo: 'convocatorias', etiqueta: 'Convocatorias', campos: ['funcionarios_convocatorias'] },
  { tipo: 'ascensos', etiqueta: 'Ascensos', campos: ['ascensos'] },
  { tipo: 'retiro', etiqueta: 'Retiros', campos: ['retiros'] },
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

// Sin relaciones_laborales, destinos ni legajo_militar: se borran con la persona.
// relaciones_familiares se cuenta aparte: su alias de _count pasa los 63 caracteres de Postgres.
export const SELECT_CONTEO_BLOQUEOS = {
  personas_documentos: { where: { archivos: { eliminado_en: null } } },
  funcionarios_cursos: true,
  funcionarios_misiones: true,
  funcionarios_convocatorias: true,
  ascensos: true,
  retiros: true,
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

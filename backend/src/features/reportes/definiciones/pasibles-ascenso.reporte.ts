import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';
import { ElegibilidadService } from '../../ascensos/elegibilidad.service';
import { ESTADOS_ELEGIBILIDAD } from '../../ascensos/dto/list-pasibles-query.dto';

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'C.I.', tipo: 'texto' },
  { clave: 'funcionario', etiqueta: 'Funcionario', tipo: 'texto' },
  { clave: 'unidad', etiqueta: 'Unidad', tipo: 'texto' },
  { clave: 'escalafon', etiqueta: 'Escalafón', tipo: 'texto' },
  { clave: 'grado_actual', etiqueta: 'Grado actual', tipo: 'texto' },
  { clave: 'grado_destino', etiqueta: 'Grado destino', tipo: 'texto' },
  { clave: 'antiguedad', etiqueta: 'Antigüedad en el grado', tipo: 'texto' },
  { clave: 'edad', etiqueta: 'Edad', tipo: 'numero' },
  { clave: 'estado', etiqueta: 'Estado', tipo: 'texto' },
  { clave: 'cumpliria', etiqueta: 'Cumpliría el', tipo: 'fecha' },
  { clave: 'motivo', etiqueta: 'Motivo', tipo: 'texto' },
  { clave: 'requisitos', etiqueta: 'Requisitos', tipo: 'texto' },
];

const ETIQUETA_ESTADO: Record<string, string> = {
  PASIBLE: 'Pasible',
  PROXIMO: 'Próximo',
  BLOQUEADO: 'Bloqueado',
  FUERA_DE_EDAD: 'Fuera de edad',
  SIN_REGLA: 'Sin regla',
  TOPE_DE_ESCALA: 'Tope de escala',
};

const enUruguayo = (iso: string): string => {
  const [anio, mes, dia] = iso.split('-');
  return `${Number(dia)}/${Number(mes)}/${anio}`;
};

const duracion = (dias: number): string => {
  const anios = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);
  const partes: string[] = [];
  if (anios > 0) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mes' : 'meses'}`);
  return partes.length ? partes.join(' ') : `${dias} días`;
};

/** Versión imprimible del listado de pasibles, con los mismos filtros. */
export const pasiblesAscensoReporte: DefinicionReporte = {
  clave: 'pasibles-ascenso',
  titulo: 'Pasibles de ascenso',
  descripcion:
    'Quién puede ascender a una fecha dada, a quién le falta solo tiempo y quién está frenado, con el motivo.',
  categoria: 'Personal',

  parametros: [
    {
      clave: 'estado',
      etiqueta: 'Estado',
      tipo: 'select',
      valorPorDefecto: 'PASIBLE',
      opciones: [
        { valor: 'PASIBLE', etiqueta: 'Pasibles' },
        { valor: 'PASIBLE,PROXIMO', etiqueta: 'Pasibles y próximos' },
        ...ESTADOS_ELEGIBILIDAD.filter((e) => e !== 'PASIBLE').map((e) => ({
          valor: e,
          etiqueta: ETIQUETA_ESTADO[e] ?? e,
        })),
        { valor: ESTADOS_ELEGIBILIDAD.join(','), etiqueta: 'Todos' },
      ],
    },
    {
      clave: 'unidad_id',
      etiqueta: 'Unidad',
      tipo: 'select',
      fuenteOpciones: 'unidades',
    },
    {
      clave: 'fecha_referencia',
      etiqueta: 'Evaluar al',
      tipo: 'fecha',
      ayuda:
        'Por defecto hoy. Para los ascensos ordinarios de oficiales se usa el 1.º de febrero.',
    },
    {
      clave: 'horizonte_meses',
      etiqueta: 'Próximos en (meses)',
      tipo: 'numero',
      valorPorDefecto: 6,
      ayuda: 'Cuántos meses hacia adelante se consideran «próximos».',
    },
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    // Se reutiliza el motor de la pantalla para que no puedan contradecirse.
    const elegibilidad = new ElegibilidadService(prisma);

    const estados = (filtros.estado ?? 'PASIBLE')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    const resultado = await elegibilidad.listarPasibles({
      estado: estados,
      unidad_id: filtros.unidad_id ? Number(filtros.unidad_id) : undefined,
      fecha_referencia: filtros.fecha_referencia || undefined,
      horizonte_meses: filtros.horizonte_meses ? Number(filtros.horizonte_meses) : 120,
      pageSize: 500,
    });

    const filas = resultado.items.map((e) => ({
      cedula: e.persona.cedula,
      funcionario: e.persona.nombre_completo,
      unidad: e.persona.unidad?.denominacion ?? '',
      escalafon: e.persona.escalafon?.denominacion ?? '',
      grado_actual: e.grado_actual.denominacion,
      grado_destino: e.grado_destino?.denominacion ?? '',
      antiguedad: duracion(e.antiguedad_dias),
      edad: e.edad ?? '',
      estado: ETIQUETA_ESTADO[e.estado] ?? e.estado,
      cumpliria: e.fecha_cumpliria ?? '',
      motivo: e.motivo ?? '',
      requisitos: e.requisitos
        .map((r) => `${!r.aplica ? '○' : r.cumple ? '✓' : '✗'} ${r.descripcion}`)
        .join(' · '),
    }));

    return {
      columnas: COLUMNAS,
      filas,
      resumen: [
        { etiqueta: 'Evaluado al', valor: enUruguayo(resultado.fecha_referencia) },
        { etiqueta: 'Funcionarios listados', valor: filas.length },
        { etiqueta: 'Pasibles en toda la fuerza', valor: resultado.stats.PASIBLE },
        { etiqueta: 'Próximos', valor: resultado.stats.PROXIMO },
        { etiqueta: 'Bloqueados', valor: resultado.stats.BLOQUEADO },
        { etiqueta: 'Fuera de edad', valor: resultado.stats.FUERA_DE_EDAD },
      ],
    };
  },
};

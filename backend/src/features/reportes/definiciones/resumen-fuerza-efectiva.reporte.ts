import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';
import { clasificarGenero, PARAMETRO_CATEGORIA } from './_helpers';
import { consultarFuerzaEfectiva } from '../fuerza-efectiva';
import { PARAMETRO_BASE } from './_helpers';

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'masculino', etiqueta: 'Masculino', tipo: 'numero' },
  { clave: 'femenino', etiqueta: 'Femenino', tipo: 'numero' },
  { clave: 'total', etiqueta: 'Total (ocupadas)', tipo: 'numero' },
  { clave: 'reincorporados', etiqueta: 'Reincorporados', tipo: 'numero' },
];

interface Acc {
  orden: number;
  grado: string;
  masculino: number;
  femenino: number;
  total: number;
  reincorporados: number;
}

export const resumenFuerzaEfectivaReporte: DefinicionReporte = {
  clave: 'resumen-fuerza-efectiva',
  titulo: 'Resumen Fuerza Efectiva',
  descripcion:
    'Efectivos por grado, con desglose masculino/femenino, total ocupado y reincorporados.',
  categoria: 'Personal',

   

  parametros: [PARAMETRO_BASE, PARAMETRO_CATEGORIA],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    const relaciones = await consultarFuerzaEfectiva(prisma, filtros);

    const mapa = new Map<string, Acc>();
    let totMasc = 0;
    let totFem = 0;

    for (const rel of relaciones) {
      const grado = rel.grados;
      const clave = grado?.id.toString() ?? 'sin-grado';
      let acc = mapa.get(clave);
      if (!acc) {
        acc = { orden: grado?.orden ?? Number.MAX_SAFE_INTEGER, grado: grado?.denominacion ?? 'Sin grado', masculino: 0, femenino: 0, total: 0, reincorporados: 0 };
        mapa.set(clave, acc);
      }
      acc.total++;
      const g = clasificarGenero(rel.personas?.genero);
      if (g === 'F') {
        acc.femenino++;
        totFem++;
      } else if (g === 'M') {
        acc.masculino++;
        totMasc++;
      }
      if (rel.grado_reincorporacion_id) acc.reincorporados++;
    }

    const filas = [...mapa.values()]
      .sort((a, b) => a.orden - b.orden)
      .map((a) => ({
        grado: a.grado,
        masculino: a.masculino,
        femenino: a.femenino,
        total: a.total,
        reincorporados: a.reincorporados,
      }));

    return {
      columnas: COLUMNAS,
      filas,
      resumen: [
        { etiqueta: 'Total efectivos', valor: relaciones.length },
        { etiqueta: 'Sin dato de género', valor: relaciones.length - totMasc - totFem },
        { etiqueta: 'Masculino', valor: totMasc },
        { etiqueta: 'Femenino', valor: totFem },
      ],
    };
  },
};

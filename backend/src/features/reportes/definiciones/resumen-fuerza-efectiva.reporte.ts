import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';
import { clasificarGenero } from './_helpers';

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
  reincorporados: number;
}

export const resumenFuerzaEfectivaReporte: DefinicionReporte = {
  clave: 'resumen-fuerza-efectiva',
  titulo: 'Resumen Fuerza Efectiva',
  descripcion:
    'Efectivos por grado, con desglose masculino/femenino, total ocupado y reincorporados.',
  categoria: 'Personal',

   

  parametros: [],

  async ejecutar({ prisma }: ContextoEjecucion): Promise<ResultadoReporte> {
    const relaciones = await prisma.relaciones_laborales.findMany({
      where: { estado: 'activo' },
      select: {
        grado_reincorporacion_id: true,
        personas: { select: { genero: true } },
        grados: { select: { denominacion: true, orden: true } },
      },
    });

    const mapa = new Map<string, Acc>();
    let totMasc = 0;
    let totFem = 0;

    for (const rel of relaciones) {
      const grado = rel.grados;
      if (!grado) continue;
      let acc = mapa.get(grado.denominacion);
      if (!acc) {
        acc = { orden: grado.orden, grado: grado.denominacion, masculino: 0, femenino: 0, reincorporados: 0 };
        mapa.set(grado.denominacion, acc);
      }
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
        total: a.masculino + a.femenino,
        reincorporados: a.reincorporados,
      }));

    return {
      columnas: COLUMNAS,
      filas,
      resumen: [
        { etiqueta: 'Total efectivos', valor: totMasc + totFem },
        { etiqueta: 'Masculino', valor: totMasc },
        { etiqueta: 'Femenino', valor: totFem },
      ],
    };
  },
};

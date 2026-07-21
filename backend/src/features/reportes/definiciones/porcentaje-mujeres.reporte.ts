import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
  SeccionReporte,
} from '../reportes.types';

/** Normaliza el campo libre `personas.genero` a 'F' | 'M' | null. */
function clasificarGenero(genero: string | null | undefined): 'F' | 'M' | null {
  if (!genero) return null;
  const g = genero.trim().toLowerCase();
  if (!g) return null;
  if (g.startsWith('f') || g.includes('femen') || g.includes('muj')) return 'F';
  if (g.startsWith('m') || g.includes('mascul') || g.includes('homb')) return 'M';
  return null;
}

interface Acumulador {
  orden: number;
  denominacion: string;
  mujeres: number;
  hombres: number;
}

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'cantidad_mujeres', etiqueta: 'Mujeres', tipo: 'numero' },
  { clave: 'cantidad_hombres', etiqueta: 'Hombres', tipo: 'numero' },
  { clave: 'total', etiqueta: 'Total', tipo: 'numero' },
  { clave: 'porcentaje_mujeres', etiqueta: 'Porcentaje mujeres', tipo: 'porcentaje' },
];

function construirFilas(mapa: Map<string, Acumulador>) {
  return [...mapa.values()]
    .sort((a, b) => a.orden - b.orden)
    .map((g) => {
      const total = g.mujeres + g.hombres;
      return {
        grado: g.denominacion,
        cantidad_mujeres: g.mujeres,
        cantidad_hombres: g.hombres,
        total,
        porcentaje_mujeres: total > 0 ? Math.round((g.mujeres / total) * 10000) / 100 : 0,
      };
    });
}

export const porcentajeMujeresReporte: DefinicionReporte = {
  clave: 'porcentaje-mujeres',
  titulo: 'Porcentaje de mujeres en la Fuerza Aérea',
  descripcion:
    'Distribución de personal femenino y masculino por grado, separando Personal Superior (oficiales) y Subalterno.',
  categoria: 'Personal',
  parametros: [
    {
      clave: 'unidad_id',
      etiqueta: 'Unidad',
      tipo: 'select',
      fuenteOpciones: 'unidades',
      ayuda: 'Opcional. Si se deja vacío incluye toda la Fuerza.',
    },
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    const unidadId = filtros.unidad_id ? BigInt(filtros.unidad_id) : undefined;

    const relaciones = await prisma.relaciones_laborales.findMany({
      where: {
        estado: 'activo',
        ...(unidadId ? { unidad_id: unidadId } : {}),
      },
      select: {
        personas: { select: { genero: true } },
        grados: {
          select: {
            denominacion: true,
            orden: true,
            es_oficial: true,
            es_subalterno: true,
          },
        },
      },
    });

    const superior = new Map<string, Acumulador>();
    const subalterno = new Map<string, Acumulador>();
    let totalMujeres = 0;
    let totalHombres = 0;
    let sinDato = 0;

    for (const rel of relaciones) {
      const genero = clasificarGenero(rel.personas?.genero);
      if (genero === 'F') totalMujeres++;
      else if (genero === 'M') totalHombres++;
      else sinDato++;

      const grado = rel.grados;
      if (!grado) continue;
      const destino = grado.es_oficial ? superior : grado.es_subalterno ? subalterno : null;
      if (!destino) continue;

      const clave = grado.denominacion;
      let acc = destino.get(clave);
      if (!acc) {
        acc = { orden: grado.orden, denominacion: grado.denominacion, mujeres: 0, hombres: 0 };
        destino.set(clave, acc);
      }
      if (genero === 'F') acc.mujeres++;
      else if (genero === 'M') acc.hombres++;
    }

    const totalConocido = totalMujeres + totalHombres;
    const totalGeneral = totalConocido + sinDato;

    const secciones: SeccionReporte[] = [
      { titulo: 'Personal Superior', columnas: COLUMNAS, filas: construirFilas(superior) },
      { titulo: 'Personal Subalterno', columnas: COLUMNAS, filas: construirFilas(subalterno) },
    ];

    return {
      secciones,
      resumen: [
        { etiqueta: 'Total fuerza efectiva', valor: totalGeneral },
        { etiqueta: 'Cantidad de mujeres', valor: totalMujeres },
        { etiqueta: 'Cantidad de hombres', valor: totalHombres },
        {
          etiqueta: 'Porcentaje de mujeres',
          valor: totalConocido > 0 ? `${Math.round((totalMujeres / totalConocido) * 10000) / 100}%` : '0%',
        },
        ...(sinDato > 0 ? [{ etiqueta: 'Sin dato de género', valor: sinDato }] : []),
      ],
    };
  },
};

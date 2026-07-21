import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';
import { unir } from './_helpers';

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'C.I.', tipo: 'texto' },
  { clave: 'tipo_mov', etiqueta: 'Tipo Mov.', tipo: 'texto' },
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'escalafon', etiqueta: 'Esc.', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
  { clave: 'destino', etiqueta: 'Destino', tipo: 'texto' },
  { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
];

export const movimientosUnidadReporte: DefinicionReporte = {
  clave: 'movimientos-unidad',
  titulo: 'Movimientos por Unidad',
  descripcion: 'Listado de movimientos del personal por unidad, con grado, destino y régimen (Ley N/V).',
  categoria: 'Personal',

   

  parametros: [
    {
      clave: 'unidad_id',
      etiqueta: 'Unidad',
      tipo: 'select',
      fuenteOpciones: 'unidades',
      ayuda: 'Opcional. Vacío = todas las unidades.',
    },
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    const unidadId = filtros.unidad_id ? BigInt(filtros.unidad_id) : undefined;

    const movimientos = await prisma.movimientos_laborales.findMany({
      where: unidadId ? { relaciones_laborales: { unidad_id: unidadId } } : {},
      include: {
        tipos_movimiento: true,
        relaciones_laborales: {
          include: {
            personas: true,
            grados: true,
            escalafones: true,
            unidades: true,
            regimenes: true,
          },
        },
      },
      orderBy: { fecha_movimiento: 'desc' },
    });

    const filas = movimientos.map((m) => {
      const rel = m.relaciones_laborales;
      return {
        cedula: rel?.personas?.cedula ?? '',
        tipo_mov: m.tipos_movimiento?.nombre ?? '',
        grado: rel?.grados?.denominacion ?? '',
        escalafon: rel?.escalafones?.codigo ?? '',
        nombre: unir(rel?.personas?.primer_nombre, rel?.personas?.segundo_nombre),
        apellido: unir(rel?.personas?.primer_apellido, rel?.personas?.segundo_apellido),
        destino: rel?.unidades?.denominacion ?? '',
        ley: rel?.regimenes?.es_ley_vieja ? 'Vieja' : 'Nueva',
      };
    });

    return {
      columnas: COLUMNAS,
      filas,
      resumen: [{ etiqueta: 'Total movimientos', valor: filas.length }],
    };
  },
};

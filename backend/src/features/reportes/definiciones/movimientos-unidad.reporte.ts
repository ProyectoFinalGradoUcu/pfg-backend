import { whereRelacionPorBase } from '../alcance-reportes';
import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';
import { categoriaDeFiltros, PARAMETRO_BASE, PARAMETRO_CATEGORIA, unir } from './_helpers';

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'C.I.', tipo: 'texto' },
  { clave: 'tipo_mov', etiqueta: 'Tipo Mov.', tipo: 'texto' },
  { clave: 'marca', etiqueta: 'Marca', tipo: 'texto' },
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'escalafon', etiqueta: 'Esc.', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
  { clave: 'base', etiqueta: 'Base', tipo: 'texto' },
  { clave: 'comando', etiqueta: 'Comando', tipo: 'texto' },
  { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
];

export const movimientosUnidadReporte: DefinicionReporte = {
  clave: 'movimientos-unidad',
  titulo: 'Movimientos por Unidad',
  descripcion: 'Listado de movimientos del personal por base, con grado, base, comando y régimen (Ley N/V).',
  categoria: 'Personal',

   

  parametros: [
    PARAMETRO_BASE,
    PARAMETRO_CATEGORIA,
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    const categoria = categoriaDeFiltros(filtros);

    const relacion = {
      ...whereRelacionPorBase(filtros),
      ...(categoria ? { tipo_funcionario: categoria } : {}),
    };

    const movimientos = await prisma.movimientos_laborales.findMany({
      where: Object.keys(relacion).length ? { relaciones_laborales: relacion } : {},
      include: {
        tipos_movimiento: true,
        relaciones_laborales: {
          include: {
            personas: true,
            grados: true,
            escalafones: true,
            unidades: true,
            sub_unidades: true,
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
        marca: m.tipos_movimiento?.marca ?? '',
        grado: rel?.grados?.denominacion ?? '',
        escalafon: rel?.escalafones?.codigo ?? '',
        nombre: unir(rel?.personas?.primer_nombre, rel?.personas?.segundo_nombre),
        apellido: unir(rel?.personas?.primer_apellido, rel?.personas?.segundo_apellido),
        base: rel?.sub_unidades?.denominacion ?? '',
        comando: rel?.unidades?.denominacion ?? '',
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

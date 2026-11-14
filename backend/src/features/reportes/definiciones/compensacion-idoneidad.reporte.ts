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
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'escalafon', etiqueta: 'Esc.', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
  { clave: 'base', etiqueta: 'Base', tipo: 'texto' },
  { clave: 'comando', etiqueta: 'Comando', tipo: 'texto' },
  { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
];

export const compensacionIdoneidadReporte: DefinicionReporte = {
  clave: 'compensacion-idoneidad',
  titulo: 'Compensación por Elevado Nivel de Idoneidad',
  descripcion:
    'Personal que percibe la Compensación Complementaria por Idoneidad (Prima Idoneidad), con grado, base, comando y régimen.',
  categoria: 'Remuneraciones',

   

  parametros: [
    PARAMETRO_BASE,
    PARAMETRO_CATEGORIA,
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    const categoria = categoriaDeFiltros(filtros);

    const relaciones = await prisma.relaciones_laborales.findMany({
      where: {
        estado: 'activo',
        superprima: true,
        ...whereRelacionPorBase(filtros),
        ...(categoria ? { tipo_funcionario: categoria } : {}),
      },
      include: {
        personas: true,
        grados: true,
        escalafones: true,
        unidades: true,
        sub_unidades: true,
        regimenes: true,
      },
    });

    const filas = relaciones
      .map((rel) => ({
        cedula: rel.personas?.cedula ?? '',
        grado: rel.grados?.denominacion ?? '',
        escalafon: rel.escalafones?.codigo ?? '',
        nombre: unir(rel.personas?.primer_nombre, rel.personas?.segundo_nombre),
        apellido: unir(rel.personas?.primer_apellido, rel.personas?.segundo_apellido),
        base: rel.sub_unidades?.denominacion ?? '',
        comando: rel.unidades?.denominacion ?? '',
        ley: rel.regimenes?.es_ley_vieja ? 'Vieja' : 'Nueva',
        _orden: rel.grados?.orden ?? 999,
      }))
      .sort((a, b) => a._orden - b._orden || a.apellido.localeCompare(b.apellido))
      .map(({ _orden, ...fila }) => fila);

    return {
      columnas: COLUMNAS,
      filas,
      resumen: [{ etiqueta: 'Total beneficiarios', valor: filas.length }],
    };
  },
};

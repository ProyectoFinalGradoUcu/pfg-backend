import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';
import { unir } from './_helpers';

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'C.I.', tipo: 'texto' },
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'escalafon', etiqueta: 'Esc.', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
  { clave: 'destino', etiqueta: 'Destino', tipo: 'texto' },
  { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
];

export const compensacionIdoneidadReporte: DefinicionReporte = {
  clave: 'compensacion-idoneidad',
  titulo: 'Compensación por Elevado Nivel de Idoneidad',
  descripcion:
    'Personal que percibe la Compensación Complementaria por Idoneidad (Prima Idoneidad), con grado, destino y régimen.',
  categoria: 'Remuneraciones',

   

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

    const relaciones = await prisma.relaciones_laborales.findMany({
      where: {
        estado: 'activo',
        superprima: true,
        ...(unidadId ? { unidad_id: unidadId } : {}),
      },
      include: {
        personas: true,
        grados: true,
        escalafones: true,
        unidades: true,
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
        destino: rel.unidades?.denominacion ?? '',
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

import { DefinicionReporte } from '../reportes.types';
import { COLUMNAS_MISIONES, consultarMisiones } from '../misiones-datos';
import { PARAMETRO_CATEGORIA } from './_helpers';

export const misionesOficialesReporte: DefinicionReporte = {
  clave: 'misiones-oficiales',
  titulo: 'Misiones / Oficiales',
  descripcion: 'Historial de participaciones en convocatorias de misiones, con país, boletín, fechas de salida/regreso y orden.',
  categoria: 'Personal',
  parametros: [
    {
      clave: 'persona_id',
      etiqueta: 'Funcionario',
      tipo: 'select',
      fuenteOpciones: 'personas',
      ayuda: 'Opcional. Vacío = todas las misiones de todo el personal.',
    },
    PARAMETRO_CATEGORIA,
  ],

  async ejecutar({ prisma, filtros }) {
    const filas = await consultarMisiones(prisma, filtros);
    return {
      columnas: COLUMNAS_MISIONES,
      filas,
      resumen: [{ etiqueta: 'Total participaciones', valor: filas.length }],
    };
  },
};

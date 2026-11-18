import { PARAMETRO_CATEGORIA } from '../definiciones/_helpers';
import { COLUMNAS_MISIONES, consultarMisiones } from '../misiones-datos';
import { FuenteCustom } from './fuentes.types';

export const misionesFuente: FuenteCustom = {
  clave: 'misiones',
  titulo: 'Misiones',
  columnas: COLUMNAS_MISIONES,
  filtros: [
    { clave: 'persona_id', etiqueta: 'Funcionario', tipo: 'select', fuenteOpciones: 'personas' },
    { clave: 'pais', etiqueta: 'País', tipo: 'texto' },
    PARAMETRO_CATEGORIA,
  ],
  consultar: consultarMisiones,
};

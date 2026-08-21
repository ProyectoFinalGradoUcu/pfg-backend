import { FuenteCustom } from './fuentes.types';
import { personalFuente } from './personal.fuente';
import { misionesFuente } from './misiones.fuente';
import { destinosFuente } from './destinos.fuente';
import { ascensosFuente } from './ascensos.fuente';

/**
 * Fuentes de datos habilitadas para reportes personalizados.
 * Agregar una fuente = crear su `*.fuente.ts` e incluirla acá.
 */
export const FUENTES: FuenteCustom[] = [
  personalFuente,
  misionesFuente,
  destinosFuente,
  ascensosFuente,
];

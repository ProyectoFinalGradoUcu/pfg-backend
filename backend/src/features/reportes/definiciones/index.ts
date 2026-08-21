import { DefinicionReporte } from '../reportes.types';
import { porcentajeMujeresReporte } from './porcentaje-mujeres.reporte';
import { primaTecnicaReporte } from './prima-tecnica.reporte';
import { fichaPersonalReporte } from './ficha-personal.reporte';
import { movimientosUnidadReporte } from './movimientos-unidad.reporte';
import { misionesOficialesReporte } from './misiones-oficiales.reporte';
import { resumenFuerzaEfectivaReporte } from './resumen-fuerza-efectiva.reporte';
import { movimientosPersonalReporte } from './movimientos-personal.reporte';

/**
 * Registro de reportes predefinidos.
 *
 * Para agregar un reporte nuevo: crear su archivo `*.reporte.ts` en esta
 * carpeta e incluirlo en este array. Nada más es necesario, el catálogo,
 * el preview y la exportación lo toman de aquí automáticamente.
 */
export const REPORTES: DefinicionReporte[] = [
  porcentajeMujeresReporte,
  primaTecnicaReporte,
  fichaPersonalReporte,
  movimientosUnidadReporte,
  misionesOficialesReporte,
  resumenFuerzaEfectivaReporte,
  movimientosPersonalReporte,
];

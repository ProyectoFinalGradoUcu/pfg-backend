import { PrismaService } from '../../../lib/prisma.service';
import { ColumnaReporte, ParametroReporte } from '../reportes.types';

/**
 * Fuente de datos para reportes PERSONALIZADOS.
 *
 * Para agregar una fuente nueva: crear un archivo `*.fuente.ts` e incluirlo en
 * ./index.ts: el builder, el preview y el export la toman automáticamente.
 */
export interface FuenteCustom {
  clave: string;
  titulo: string;
  columnas: ColumnaReporte[];
  filtros: ParametroReporte[];
  consultar(
    prisma: PrismaService,
    filtros: Record<string, string | undefined>,
  ): Promise<Record<string, unknown>[]>;
}

/** Metadatos de la fuente (sin la función de consulta). */
export type FuenteCatalogo = Omit<FuenteCustom, 'consultar'>;

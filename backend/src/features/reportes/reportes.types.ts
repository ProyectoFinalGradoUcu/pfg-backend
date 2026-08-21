import { PrismaService } from '../../lib/prisma.service';

/**
 *  Para agregar un reporte nuevo basta con
 *  crear un archivo que implemente esta interfaz y registrarlo en
 *  ./definiciones/index.ts.
 */

export type TipoParametro = 'texto' | 'numero' | 'fecha' | 'select' | 'booleano';
export type TipoColumna = 'texto' | 'numero' | 'porcentaje' | 'fecha';

export interface OpcionParametro {
  valor: string;
  etiqueta: string;
}

export interface ParametroReporte {
  clave: string;
  etiqueta: string;
  tipo: TipoParametro;
  requerido?: boolean;
  opciones?: OpcionParametro[];
  fuenteOpciones?: string;
  valorPorDefecto?: string | number | boolean;
  ayuda?: string;
}

export interface ColumnaReporte {
  clave: string;
  etiqueta: string;
  tipo?: TipoColumna;
}

export interface SeccionReporte {
  titulo: string;
  columnas: ColumnaReporte[];
  filas: Record<string, unknown>[];
}

export interface LineaResumen {
  etiqueta: string;
  valor: string | number;
}

export interface ResultadoReporte {
  columnas?: ColumnaReporte[];
  filas?: Record<string, unknown>[];
  secciones?: SeccionReporte[];
  resumen?: LineaResumen[];
}

export interface ContextoEjecucion {
  prisma: PrismaService;
  filtros: Record<string, string | undefined>;
}

export interface DefinicionReporte {
  clave: string;
  titulo: string;
  descripcion: string;
  categoria?: string;
  parametros: ParametroReporte[];
  ejecutar(ctx: ContextoEjecucion): Promise<ResultadoReporte>;
}

export type ReporteCatalogo = Omit<DefinicionReporte, 'ejecutar'>;

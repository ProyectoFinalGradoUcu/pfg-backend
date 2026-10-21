export interface ResultadoFila {
  fila: number;
  cedula: string;
  estado: 'ok' | 'error';
  id?: number;
  mensaje?: string;
}

export interface ResultadoCarga {
  total: number;
  exitosos: number;
  errores: number;
  resultados: ResultadoFila[];
  avisos?: string[];
}

export type TipoColumna = 'texto' | 'fecha' | 'numero' | 'lista';

export interface ColumnaPlantilla {
  clave: string;
  titulo: string;
  requerida?: boolean;
  ayuda?: string;
  tipo?: TipoColumna;
  lista?: string;
  /** En false la lista solo sugiere y acepta texto libre, por ejemplo una misión nueva. */
  listaEstricta?: boolean;
  ancho?: number;
}

export interface ListaPlantilla {
  nombre: string;
  titulo: string;
  valores: string[];
}

export interface DefinicionPlantilla {
  hoja: string;
  titulo: string;
  columnas: ColumnaPlantilla[];
  listas?: ListaPlantilla[];
  /** Van en una hoja aparte para que no se importen por error. */
  ejemplos?: Record<string, string | number | Date>[];
  instrucciones?: string[];
}

/** Valores como texto; las fechas en formato AAAA-MM-DD. */
export interface FilaLeida {
  fila: number;
  valores: Record<string, string>;
}

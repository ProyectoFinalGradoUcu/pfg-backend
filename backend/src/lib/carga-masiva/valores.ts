import { HttpException } from '@nestjs/common';
import { FilaLeida, ResultadoCarga, ResultadoFila } from './carga-masiva.types.js';

/** Minúsculas, sin tildes y con los espacios colapsados: para comparar lo que escribe el usuario. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Acepta AAAA-MM-DD (lo que deja el lector para celdas de fecha) y DD/MM/AAAA (lo que tipea
 * alguien en una celda de texto). Devuelve AAAA-MM-DD o lanza con el nombre de la columna.
 */
export function parsearFecha(valor: string, columna: string): string | undefined {
  if (!valor) return undefined;
  let anio: number, mes: number, dia: number;
  let m = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = valor.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    throw new Error(`"${columna}": "${valor}" no es una fecha válida. Usá el formato dd/mm/aaaa.`);
  }
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia || anio < 1900) {
    throw new Error(`"${columna}": "${valor}" no es una fecha válida.`);
  }
  return fecha.toISOString().slice(0, 10);
}

export function parsearSiNo(valor: string, columna: string): boolean | undefined {
  if (!valor) return undefined;
  const v = normalizar(valor);
  if (['si', 's', 'true', 'verdadero', 'x'].includes(v)) return true;
  if (['no', 'n', 'false', 'falso'].includes(v)) return false;
  throw new Error(`"${columna}": "${valor}" no es válido. Usá SI o NO.`);
}

export function parsearEntero(valor: string, columna: string): number | undefined {
  if (!valor) return undefined;
  const n = Number(valor.replace(',', '.'));
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`"${columna}": "${valor}" tiene que ser un número entero mayor o igual a 0.`);
  }
  return n;
}

/** Saca puntos, guiones y espacios: "1.234.567-8" y "12345678" son la misma cédula. */
export function normalizarCedula(valor: string): string {
  return valor.replace(/[.\-\s]/g, '');
}

/** Elige entre opciones fijas comparando sin tildes ni mayúsculas. Devuelve el valor asociado. */
export function elegirOpcion<T>(valor: string, columna: string, opciones: Record<string, T>): T | undefined {
  if (!valor) return undefined;
  const buscado = normalizar(valor);
  for (const [etiqueta, resultado] of Object.entries(opciones)) {
    if (normalizar(etiqueta) === buscado) return resultado;
  }
  throw new Error(`"${columna}": "${valor}" no es válido. Valores admitidos: ${Object.keys(opciones).join(', ')}.`);
}

const SEPARADOR = ' — ';

export interface ItemCatalogo {
  id: bigint;
  codigo?: string | null;
  nombre: string;
}

/**
 * Catálogo que el usuario elige por texto en vez de por ID. La etiqueta que va a la lista
 * desplegable es "CÓDIGO — Nombre" (o solo el nombre si no hay código). Al leer se acepta la
 * etiqueta completa, solo el código o solo el nombre, siempre que no sea ambiguo.
 */
export class Catalogo<T extends ItemCatalogo> {
  private readonly porEtiqueta = new Map<string, T>();
  private readonly porCodigo = new Map<string, T>();
  private readonly porNombre = new Map<string, T[]>();
  readonly etiquetas: string[] = [];

  constructor(
    private readonly columna: string,
    readonly items: T[],
  ) {
    const repetidos = new Set(
      items.map((i) => this.etiquetaBase(i)).filter((e, idx, arr) => arr.indexOf(e) !== idx),
    );
    for (const item of items) {
      const base = this.etiquetaBase(item);
      // Dos items con la misma etiqueta: se desambiguan con el ID para que la lista sea elegible.
      const etiqueta = repetidos.has(base) ? `${base} (#${item.id})` : base;
      this.etiquetas.push(etiqueta);
      this.porEtiqueta.set(normalizar(etiqueta), item);
      if (item.codigo) this.porCodigo.set(normalizar(item.codigo), item);
      const nombre = normalizar(item.nombre);
      this.porNombre.set(nombre, [...(this.porNombre.get(nombre) ?? []), item]);
    }
  }

  etiquetaDe(item: T): string {
    return this.etiquetas[this.items.indexOf(item)];
  }

  buscar(valor: string): T | undefined {
    const v = normalizar(valor);
    const exacto = this.porEtiqueta.get(v) ?? this.porCodigo.get(v);
    if (exacto) return exacto;
    // "CÓDIGO — nombre" con el nombre cambiado o tipeado a mano: alcanza con el código.
    const codigo = v.split(/\s[—–-]\s/)[0].trim();
    if (codigo !== v && this.porCodigo.has(codigo)) return this.porCodigo.get(codigo);
    const porNombre = this.porNombre.get(v);
    if (porNombre?.length === 1) return porNombre[0];
    if (porNombre && porNombre.length > 1) {
      throw new Error(`"${this.columna}": "${valor}" es ambiguo. Elegilo de la lista desplegable.`);
    }
    return undefined;
  }

  resolver(valor: string): T {
    const item = this.buscar(valor);
    if (!item) {
      throw new Error(`"${this.columna}": "${valor}" no existe. Elegí un valor de la lista desplegable.`);
    }
    return item;
  }

  resolverOpcional(valor: string): T | undefined {
    return valor ? this.resolver(valor) : undefined;
  }

  private etiquetaBase(item: T): string {
    return item.codigo ? `${item.codigo}${SEPARADOR}${item.nombre}` : item.nombre;
  }
}

/** Mensaje legible para el resumen, venga de una excepción HTTP, de Prisma o de una validación. */
export function mensajeDeError(err: unknown): string {
  if (err instanceof HttpException) {
    const resp = err.getResponse();
    if (typeof resp === 'string') return resp;
    const msg = (resp as { message?: string | string[] }).message;
    return Array.isArray(msg) ? msg.join('. ') : (msg ?? err.message);
  }
  const code = (err as { code?: string })?.code;
  if (code === 'P2002') return 'El registro ya existe (dato duplicado).';
  if (code === 'P2003') return 'Uno de los valores elegidos no existe en el sistema.';
  if (err instanceof Error) return err.message;
  return 'Error desconocido';
}

export interface ResultadoProcesoFila {
  id?: number | bigint;
  mensaje?: string;
}

/** Procesa las filas en orden, una por vez. */
export async function procesarEnSerie(
  filas: FilaLeida[],
  procesar: (fila: FilaLeida) => Promise<ResultadoProcesoFila>,
  referencia: (fila: FilaLeida) => string = (f) => f.valores['cedula'] ?? '',
): Promise<ResultadoFila[]> {
  const resultados: ResultadoFila[] = [];
  for (const fila of filas) {
    try {
      const r = await procesar(fila);
      resultados.push({
        fila: fila.fila,
        cedula: referencia(fila),
        estado: 'ok',
        ...(r.id !== undefined ? { id: Number(r.id) } : {}),
        ...(r.mensaje ? { mensaje: r.mensaje } : {}),
      });
    } catch (err) {
      resultados.push({ fila: fila.fila, cedula: referencia(fila), estado: 'error', mensaje: mensajeDeError(err) });
    }
  }
  return resultados;
}

export function resumir(resultados: ResultadoFila[]): ResultadoCarga {
  const ordenados = [...resultados].sort((a, b) => a.fila - b.fila);
  const exitosos = ordenados.filter((r) => r.estado === 'ok').length;
  return { total: ordenados.length, exitosos, errores: ordenados.length - exitosos, resultados: ordenados };
}

/** Marca como error las filas cuya clave ya apareció más arriba en el mismo archivo. */
export function separarRepetidas(
  filas: FilaLeida[],
  clave: (f: FilaLeida) => string,
  mensaje: (filaPrevia: number) => string,
): { unicas: FilaLeida[]; repetidas: ResultadoFila[] } {
  const vistas = new Map<string, number>();
  const unicas: FilaLeida[] = [];
  const repetidas: ResultadoFila[] = [];
  for (const f of filas) {
    const k = clave(f);
    if (k && vistas.has(k)) {
      repetidas.push({ fila: f.fila, cedula: f.valores['cedula'] ?? '', estado: 'error', mensaje: mensaje(vistas.get(k)!) });
      continue;
    }
    if (k) vistas.set(k, f.fila);
    unicas.push(f);
  }
  return { unicas, repetidas };
}

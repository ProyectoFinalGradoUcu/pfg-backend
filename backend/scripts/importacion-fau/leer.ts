/** Lectura de los Access y del Excel de horas de vuelo de la FAU. */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Workbook } from 'exceljs';
import { clave, texto } from './normalizar.js';

export type Fila = Record<string, unknown>;

export interface BaseAccess {
  archivo: string;
  tipo: 'subalternos' | 'oficiales';
  tablas: Map<string, Fila[]>;
}

/** Tablas que usa el importador; el resto de cada base se ignora. */
const TABLAS = {
  subalternos: ['EFECTIVOSSUB'],
  oficiales: ['xescala', 'DESNUM', 'xsalida', 'Misiones', 'OFICIALES EN MISION', 'Horasvlo'],
};

/**
 * Lee un .mdb/.accdb con mdb-reader (JavaScript puro: no necesita el driver de Access, así que
 * corre igual en Windows y en el servidor Linux). La contraseña de base de los .mdb no cifra los
 * datos, así que no hace falta.
 */
export async function leerAccess(ruta: string): Promise<BaseAccess> {
  // mdb-reader se publica solo como módulo ES.
  const { default: MDBReader } = await import('mdb-reader');
  const reader = new MDBReader(readFileSync(ruta));
  const nombres = new Set(reader.getTableNames());
  const tipo = nombres.has('EFECTIVOSSUB') ? 'subalternos' : nombres.has('xescala') ? 'oficiales' : null;
  if (!tipo) throw new Error(`${basename(ruta)}: no tiene EFECTIVOSSUB ni xescala; no es una base de la FAU conocida.`);
  const tablas = new Map<string, Fila[]>();
  for (const t of TABLAS[tipo]) {
    if (nombres.has(t)) tablas.set(t, reader.getTable(t).getData() as Fila[]);
  }
  return { archivo: basename(ruta), tipo, tablas };
}

// ── Excel de horas de vuelo ──────────────────────────────────────────────────

export interface FilaVuelo {
  hoja: string;
  fila: number;
  grado: unknown;
  escalafon: unknown;
  nombre: unknown;
  cedula: unknown;
  unidadVuelo: unknown;
  aeronaves: unknown;
  hsAvAnio: unknown;
  hsAvTotal: unknown;
  hsObAnio: unknown;
  hsObTotal: unknown;
}

export interface HojaVuelo {
  titulo: string;
  periodo: { anio: number; numero: number } | null;
  sinEncabezados: boolean;
  filas: FilaVuelo[];
}

/** Encabezados conocidos (normalizados con clave()) → campo. Cambian de una hoja a otra. */
const ALIAS_COLUMNAS: Record<string, keyof FilaVuelo> = {
  GRADO: 'grado',
  ESC: 'escalafon',
  ABREESC: 'escalafon',
  NOMBREYAPELLIDO: 'nombre',
  EXPR1002: 'nombre',
  CEDIN: 'cedula',
  UNIDADDEVUELO: 'unidadVuelo',
  AVIONES: 'aeronaves',
  AERONAVES: 'aeronaves',
  HSAVANOMILITAR: 'hsAvAnio',
  HSAVTOTAL: 'hsAvTotal',
  HSOBANOMILITAR: 'hsObAnio',
  HSOBTOTAL: 'hsObTotal',
};

/** Orden de las columnas en las hojas sin encabezados (iguales a las de 2022 en adelante). */
const SIN_ENCABEZADOS: Array<keyof FilaVuelo> = [
  'grado', 'escalafon', 'nombre', 'periodo' as keyof FilaVuelo, 'unidadVuelo', 'aeronaves',
  'hsAvAnio', 'hsAvTotal', 'hsObAnio', 'hsObTotal',
];
const HORAS: Array<keyof FilaVuelo> = ['hsAvAnio', 'hsAvTotal', 'hsObAnio', 'hsObTotal'];

/** "1er Período 2020", "3erPeríodo 2025 (2)", "4to Período 2026." → { anio, numero } */
export function periodoDeHoja(titulo: string): { anio: number; numero: number } | null {
  const m = /([1-4])\s*(?:er|do|ro|to)?\s*per[ií]odo\s*(\d{4})/i.exec(titulo);
  return m ? { anio: Number(m[2]), numero: Number(m[1]) } : null;
}

function valorCelda(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if ('result' in o) return o.result;
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if ('text' in o) return o.text;
  }
  return v;
}

export async function leerExcelVuelo(ruta: string): Promise<HojaVuelo[]> {
  const wb = new Workbook();
  await wb.xlsx.readFile(ruta);
  const hojas: HojaVuelo[] = [];
  wb.eachSheet((ws) => {
    const filas: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const valores = (row.values as unknown[]).slice(1).map(valorCelda);
      filas[n - 1] = valores;
    });
    const encabezado = (filas[0] ?? []).map((v) => ALIAS_COLUMNAS[clave(v)]);
    const conEncabezados = encabezado.filter(Boolean).length >= 2;

    let mapa: Array<keyof FilaVuelo | undefined>;
    if (conEncabezados) {
      mapa = encabezado;
      // 4to Período 2020: las cuatro columnas de horas vienen sin título después de los aviones.
      const iAeronaves = mapa.indexOf('aeronaves');
      if (iAeronaves >= 0 && !HORAS.some((h) => mapa.includes(h))) {
        HORAS.forEach((h, k) => {
          if (mapa[iAeronaves + 1 + k] === undefined) mapa[iAeronaves + 1 + k] = h;
        });
      }
    } else {
      mapa = SIN_ENCABEZADOS;
    }

    const datos = conEncabezados ? filas.slice(1) : filas;
    const leidas: FilaVuelo[] = [];
    datos.forEach((valores, k) => {
      if (!valores) return;
      const f = { hoja: ws.name, fila: k + (conEncabezados ? 2 : 1) } as FilaVuelo;
      mapa.forEach((campo, j) => {
        if (campo && campo !== ('periodo' as keyof FilaVuelo)) (f as unknown as Fila)[campo] = valores[j];
      });
      if (texto(f.nombre) || texto(f.cedula)) leidas.push(f);
    });
    hojas.push({ titulo: ws.name, periodo: periodoDeHoja(ws.name), sinEncabezados: !conEncabezados, filas: leidas });
  });
  return hojas;
}

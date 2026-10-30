/** Normalización de los valores tal como vienen en los Access y el Excel de la FAU. */

/** Mayúsculas, sin tildes ni signos: para comparar textos de catálogo ("At.Ppal." = "AT. PPAL"). */
export function clave(texto: unknown): string {
  return sinTildes(String(texto ?? ''))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// ── Cédula ───────────────────────────────────────────────────────────────────

export function digitoVerificador(base: string): string {
  const pesos = [2, 9, 8, 7, 6, 3, 4];
  const suma = base
    .padStart(7, '0')
    .split('')
    .reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  return String((10 - (suma % 10)) % 10);
}

export interface Cedula {
  /** Como la guarda el sistema: solo dígitos, con verificador. */
  valor: string;
  verificadorValido: boolean;
}

/**
 * Cédula con dígito verificador (CI de subalternos, cédula de oficiales, CEDIN).
 * Si viene mal y hay cédula sin verificador (CED_PERS), se reconstruye desde esa.
 */
export function normalizarCedula(conVerificador: unknown, sinVerificador?: unknown): Cedula | null {
  const d = soloDigitos(conVerificador);
  if (d.length >= 7 && d.length <= 8) {
    const valido = digitoVerificador(d.slice(0, -1)) === d.slice(-1);
    if (valido) return { valor: d, verificadorValido: true };
    const base = soloDigitos(sinVerificador);
    if (base.length >= 6 && base.length <= 7) return { valor: base + digitoVerificador(base), verificadorValido: true };
    return { valor: d, verificadorValido: false };
  }
  const base = soloDigitos(sinVerificador);
  if (base.length >= 6 && base.length <= 7) return { valor: base + digitoVerificador(base), verificadorValido: true };
  return null;
}

function soloDigitos(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.trunc(v)) : '';
  return String(v).replace(/\D/g, '');
}

// ── Fechas ───────────────────────────────────────────────────────────────────

const FECHA_TEXTO = /^\s*(\d{1,2})\s*\/+\s*(\d{1,2})\s*\/+\s*(\d{2}|\d{4})\s*$/;

/**
 * Fecha como "YYYY-MM-DD". Acepta Date (columnas de fecha de Access) y texto dd/mm/aaaa con
 * variantes (d/m/aa, dd//mm/aaaa). Años fuera de 1900-2100 se descartan: son errores de tipeo.
 */
export function normalizarFecha(v: unknown): string | null {
  let fecha: Date | null = null;
  if (v instanceof Date) fecha = v;
  else if (typeof v === 'string') {
    const m = FECHA_TEXTO.exec(v);
    if (m) {
      const anio = m[3].length === 4 ? Number(m[3]) : Number(m[3]) > 30 ? 1900 + Number(m[3]) : 2000 + Number(m[3]);
      fecha = new Date(Date.UTC(anio, Number(m[2]) - 1, Number(m[1])));
      if (fecha.getUTCDate() !== Number(m[1]) || fecha.getUTCMonth() !== Number(m[2]) - 1) return null;
    }
  }
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const anio = fecha.getUTCFullYear();
  if (anio < 1900 || anio > 2100) return null;
  return fecha.toISOString().slice(0, 10);
}

// ── Números ──────────────────────────────────────────────────────────────────

/** Horas de vuelo: "12,5", "12.5", 12.5, "1.234,5". Devuelve null si no es un número. */
export function normalizarDecimal(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = texto(v);
  if (!s) return null;
  let t = s.replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function normalizarEntero(v: unknown): number | null {
  const n = normalizarDecimal(v);
  return n === null ? null : Math.trunc(n);
}

// ── Nombres ──────────────────────────────────────────────────────────────────

export function palabras(v: unknown): string[] {
  return sinTildes(String(v ?? ''))
    .toUpperCase()
    .replace(/\*/g, ' ')
    .split(/[^A-Z]+/)
    .filter(Boolean);
}

/** Posibles (apellidos, nombres). Con coma hay uno solo; sin coma, todos los cortes. */
export function separarNombre(v: unknown): Array<[string[], string[]]> {
  const s = String(v ?? '');
  if (s.includes(',')) {
    const [a, ...n] = s.split(',');
    return [[palabras(a), palabras(n.join(' '))]];
  }
  const p = palabras(s);
  return p.slice(1).map((_, i) => [p.slice(0, i + 1), p.slice(i + 1)] as [string[], string[]]);
}

/** Separa "APELLIDO1 APELLIDO2, Nombre1 Nombre2" en los cuatro campos de `personas`. */
export function partesNombre(v: unknown): {
  primer_apellido: string;
  segundo_apellido: string | null;
  primer_nombre: string;
  segundo_nombre: string | null;
} | null {
  const s = texto(v);
  if (!s || !s.includes(',')) return null;
  const [a, ...n] = s.split(',');
  const ap = a.trim().split(/\s+/).filter(Boolean);
  const no = n.join(' ').trim().split(/\s+/).filter(Boolean);
  if (!ap.length || !no.length) return null;
  return {
    primer_apellido: ap[0],
    segundo_apellido: ap.slice(1).join(' ') || null,
    primer_nombre: no[0],
    segundo_nombre: no.slice(1).join(' ') || null,
  };
}

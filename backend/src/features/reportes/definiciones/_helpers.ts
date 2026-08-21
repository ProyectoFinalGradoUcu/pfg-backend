import { ColumnaReporte } from '../reportes.types';

/** Columnas para reportes de ficha (una fila por par Campo/Valor). */
export const COLUMNAS_CAMPO_VALOR: ColumnaReporte[] = [
  { clave: 'campo', etiqueta: 'Campo', tipo: 'texto' },
  { clave: 'valor', etiqueta: 'Valor', tipo: 'texto' },
];

/** Formatea una fecha a dd/mm/aaaa. Devuelve '' si es null. */
export function fmtFecha(fecha: Date | null | undefined): string {
  if (!fecha) return '';
  const d = new Date(fecha);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Une nombre y apellido compuestos descartando las partes vacías. */
export function unir(...partes: (string | null | undefined)[]): string {
  return partes.filter(Boolean).join(' ');
}

/** Fila para reportes de ficha. */
export function campo(campo: string, valor: unknown): { campo: string; valor: string } {
  return { campo, valor: valor === null || valor === undefined ? '' : String(valor) };
}

/** Normaliza el campo libre `personas.genero` a 'F' | 'M' | null. */
export function clasificarGenero(genero: string | null | undefined): 'F' | 'M' | null {
  if (!genero) return null;
  const g = genero.trim().toLowerCase();
  if (!g) return null;
  if (g.startsWith('f') || g.includes('femen') || g.includes('muj')) return 'F';
  if (g.startsWith('m') || g.includes('mascul') || g.includes('homb')) return 'M';
  return null;
}

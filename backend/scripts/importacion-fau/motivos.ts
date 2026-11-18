/**
 * Motivo de baja de subalternos (EFECTIVOSSUB.MOTIVO, texto libre) → catálogo motivos_baja.
 *
 * Las reglas salen de los textos más frecuentes del original, exportados con los números largos
 * enmascarados. La calificación de conducta que va al
 * final ("CONDUCTA BUENA", "C/MALA") no es el motivo: es cómo se fue.
 */
import { sinTildes, texto } from './normalizar.js';

/**
 * Motivos que el catálogo no tiene. Se agregan **vigentes** (solo con --crear-catalogos, porque
 * motivos_baja es de liquidación): se repiten mucho, así que se van a seguir usando.
 * Ningún cálculo depende del motivo, ni en liquidación ni en este sistema: RETIRO_OBL y RETIRO_VOL
 * se registran como movimiento "Retiro" y cualquier otro como "Baja" (como estos dos), y
 * FALLECIMIENTO lo usa el alta de fallecimiento. Al ser vigentes, aparecen para elegir al dar una
 * baja en los dos sistemas.
 */
export const MOTIVOS_NUEVOS: Record<string, string> = {
  NO_ADAPTACION: 'Baja por no adaptarse a la vida militar o no asimilar la instrucción.',
  NO_APTO: 'Baja por no apto en el examen psicofísico.',
  BAJA_SOLICITADA: 'Baja solicitada.',
  // Hasta 20 caracteres: liquidación guarda el código en aguinaldo_baja.motivo_baja_codigo VARCHAR(20).
  CUMPLIDO_SOLICITADA: 'Baja por cumplido y solicitarla.',
};

/** [patrón sobre el texto sin tildes y en mayúsculas, código]. Gana el primero que coincide. */
const REGLAS: Array<[RegExp, string]> = [
  [/FALLEC/, 'FALLECIMIENTO'],
  [/INCAPACIDAD/, 'INCAPACIDAD'],
  [/\bRET(IRO)?\b\.?\s*OB[LI]/, 'RETIRO_OBL'],
  [/\bRET(IRO)?\b\.?\s*VOL/, 'RETIRO_VOL'],
  [/NO ADAPTA|NO ASIMILA/, 'NO_ADAPTACION'],
  [/NO APTO/, 'NO_APTO'],
  [/FALTA|FALTAR|DESERCION|TOQUE DE LISTA|SUSTANCIAS|JUSTICIA|INCUMPLIMIENTO DEL CONTRATO|HAB\.?\s*INC/, 'MALA_CONDUCTA'],
  [/MINISTERIO DEL INTERIOR|PASE A CIVIL|\bCESE\b/, 'CESE'],
  // "Cumplido y solicitarla" es una causal propia (lo indicó la FAU): va antes de las dos sueltas.
  [/CUMPLIDO.*SOLICI?T/, 'CUMPLIDO_SOLICITADA'],
  [/CUMPLIDO|NO RENOVACION|VTO\.?\s*DOC/, 'TERMINO_CONTRATO'],
  // "Solicitarla": la FAU confirmó que es una baja solicitada, no un retiro voluntario.
  [/SOLICI?T|BAJA VOLUNTARIA/, 'BAJA_SOLICITADA'],
];

/** Cambios de situación que el Access registra como baja de subalternos, pero no son retiros. */
const NO_ES_RETIRO = /\bASC(ENSO|\.)?\s*(A\s*)?ALF|CAMBIO DE UNIDAD EJECUTORA/;

export type MotivoLeido =
  | { tipo: 'motivo'; codigo: string; numeroOrden: string | null; boletin: string | null }
  | { tipo: 'no_es_retiro' }
  | { tipo: 'desconocido' };

export function motivoBaja(v: unknown): MotivoLeido | null {
  const t = texto(v);
  if (!t) return null;
  const s = sinTildes(t).toUpperCase();
  if (NO_ES_RETIRO.test(s)) return { tipo: 'no_es_retiro' };
  const regla = REGLAS.find(([re]) => re.test(s));
  if (!regla) return { tipo: 'desconocido' };
  // "BMDN Nº 10.000" / "BOL. 1234" → boletín; "ACTA 10.000" / "OCGFA Nº 1234" → número de orden.
  const boletin = /\b(?:B\.?\s?M\.?\s?D\.?\s?N|BDMN|BOL)\.?\s*(?:MDN\s*)?N?[º°]?\s*([\d.]+\d)/.exec(s)?.[1] ?? null;
  const orden = /\b(ACTA|O\.?\s?C\.?\s?G\.?\s?F\.?\s?A)\.?\s*N?[º°]?\s*([\d.]+\d)/.exec(s);
  return {
    tipo: 'motivo', codigo: regla[1], boletin,
    numeroOrden: orden ? `${/ACTA/.test(orden[1]) ? 'Acta' : 'O.C.G.F.A.'} ${orden[2]}` : null,
  };
}

/**
 * Conducta con la que se fue, del final del motivo: "CONDUCTA BUENA", "CONDCUTA BUENA", "C/MALA",
 * "(CONDUCTA BUENA)". Va a relaciones_laborales.conducta (columna de este sistema, texto libre;
 * liquidación no la conoce). null si el texto no la dice.
 */
export function conductaDeMotivo(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const m = /\b(?:CON\w*TA|C\s*\/)\s*(MUY BUENA|BUENA|REGULAR|MALA|EXCELENTE)\b/.exec(sinTildes(t).toUpperCase());
  if (!m) return null;
  return m[1].charAt(0) + m[1].slice(1).toLowerCase();
}

/**
 * Datos que van a tablas solo del módulo de personal, colgados de personas ya resueltas por el
 * plan: misiones y salidas al exterior, nivel educativo (legajo militar), cursos aprobados e
 * historial de ascensos.
 */
import { BaseAccess, Fila } from './leer.js';
import { clave, normalizarEntero, normalizarFecha, sinTildes, texto } from './normalizar.js';

// ── Misiones ─────────────────────────────────────────────────────────────────

export interface MisionLeida {
  /** Identifica la misión: mismo texto, país y fechas = misma misión, aunque vengan en filas distintas. */
  clave: string;
  campos: {
    nombre_mision: string;
    pais: string | null;
    tipo_mision: string | null;
    fecha_salida: string | null;
    fecha_llegada: string | null;
    numero_orden: string | null;
    boletin: string | null;
    observaciones: string | null;
  };
  cedula: unknown;
  origen: string;
}

const TIPOS: Record<string, string> = { PAZ: 'Paz', DIPLOMATICA: 'Diplomática', DIPLOMATICAS: 'Diplomática',
  DIPLOMATICO: 'Diplomática', OFICIAL: 'Oficial', OFICIALES: 'Oficial' };

const corto = (v: unknown, n: number) => texto(v)?.slice(0, n) ?? null;
/** Los números de orden en 0 son "sin dato" en el Access. */
const numero = (v: unknown, n: number) => (normalizarEntero(v) === 0 ? null : corto(v, n));

export function claveMision(nombre: unknown, pais: unknown, salida: string | null, regreso: string | null): string {
  return `${clave(nombre)}|${clave(pais)}|${salida ?? ''}|${regreso ?? ''}`;
}

/**
 * xsalida: una fila por persona y salida. OFICIALES EN MISION es una versión vieja de xsalida
 * (95% de sus filas ya están ahí): solo se toman las que no estén. Misiones: una fila por
 * oficial con su misión larga (de paz, diplomática u oficial).
 */
export function leerMisiones(base: BaseAccess | undefined): { misiones: MisionLeida[]; vacias: number } {
  if (!base) return { misiones: [], vacias: 0 };
  const misiones: MisionLeida[] = [];
  let vacias = 0;
  const vistas = new Set<string>();
  // La clave sale del nombre final (también el armado cuando el Access no trae texto), para que una
  // segunda corrida reconozca la misión que ya está en la base.
  const agregar = (m: Omit<MisionLeida, 'clave'>) =>
    misiones.push({ ...m, clave: claveMision(m.campos.nombre_mision, m.campos.pais, m.campos.fecha_salida, m.campos.fecha_llegada) });

  const salida = (f: Fila, tabla: string, i: number) => {
    const sal = normalizarFecha(f['FEC_SAL']);
    const reg = normalizarFecha(f['FEC_REG']);
    if (!texto(f['MISION']) && !texto(f['PAIS']) && !sal) return vacias++;
    const k = `${clave(f['CEDIN'])}|${sal}|${clave(f['PAIS'])}`;
    if (vistas.has(k)) return;
    vistas.add(k);
    const resol = [texto(f['RESOL']) && `Resolución ${texto(f['RESOL'])}${normalizarFecha(f['FEC_RESOL']) ? ` del ${normalizarFecha(f['FEC_RESOL'])}` : ''}`,
      texto(f['RESOL_CJEFE']) && `Resolución C. en Jefe ${texto(f['RESOL_CJEFE'])}${normalizarFecha(f['FEC_RESOL_CJ']) ? ` del ${normalizarFecha(f['FEC_RESOL_CJ'])}` : ''}`,
      numero(f['ORDEN'], 50) && normalizarFecha(f['FEC_ORD']) && `Orden del ${normalizarFecha(f['FEC_ORD'])}`].filter(Boolean).join('; ');
    agregar({
      campos: {
        nombre_mision: corto(f['MISION'], 200) ?? `Salida al exterior${texto(f['PAIS']) ? ` (${texto(f['PAIS'])})` : ''}`,
        pais: corto(f['PAIS'], 100), tipo_mision: null, fecha_salida: sal, fecha_llegada: reg,
        numero_orden: numero(f['ORDEN'], 50), boletin: numero(f['BOLETIN'], 50), observaciones: resol || null,
      },
      cedula: f['CEDIN'], origen: `${tabla} fila ${i + 1}`,
    });
  };
  (base.tablas.get('xsalida') ?? []).forEach((f, i) => salida(f, 'xsalida', i));
  (base.tablas.get('OFICIALES EN MISION') ?? []).forEach((f, i) => salida(f, 'OFICIALES EN MISION', i));

  (base.tablas.get('Misiones') ?? []).forEach((f, i) => {
    const sal = normalizarFecha(f['F-Salida']);
    if (!texto(f['Misión']) && !texto(f['País']) && !sal) return vacias++;
    const tipo = TIPOS[clave(f['Tipo'])] ?? texto(f['Tipo']);
    const enPais = clave(f['en el país']);
    const obs = [texto(f['Observaciones']), texto(f['Fecha Sal y Reg']) && `Salida y regreso: ${texto(f['Fecha Sal y Reg'])}`,
      texto(f['Orden Modif']) && `Orden modificativa: ${texto(f['Orden Modif'])}`,
      numero(f['Resol'], 50) && `Resolución ${texto(f['Resol'])}${normalizarFecha(f['F-Resol']) ? ` del ${normalizarFecha(f['F-Resol'])}` : ''}`,
      enPais === 'SI' ? 'En el país' : enPais === 'NO' ? 'En el exterior' : null].filter(Boolean).join('; ');
    agregar({
      campos: {
        nombre_mision: corto(f['Misión'], 200) ?? `Misión${tipo ? ` ${tipo.toLowerCase()}` : ''}${texto(f['País']) ? ` (${texto(f['País'])})` : ''}`,
        pais: corto(f['País'], 100), tipo_mision: tipo ? tipo.slice(0, 100) : null, fecha_salida: sal, fecha_llegada: null,
        numero_orden: numero(f['O-CGFA'], 50), boletin: numero(f['Bol-MDN'], 50), observaciones: obs || null,
      },
      cedula: f['CEDIN'], origen: `Misiones fila ${i + 1}`,
    });
  });
  return { misiones, vacias };
}

// ── Nivel educativo ──────────────────────────────────────────────────────────

/**
 * Texto libre del Access → valor de NIVELES_EDUCATIVOS del backend
 * (src/features/subalternos/legajo-militar.constants.ts). null si no se puede saber.
 */
export function nivelEducativo(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const s = sinTildes(t).toUpperCase();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s.trim())) return null; // una fecha cargada en el campo equivocado
  if (s.includes('PRIMARIA')) return 'PRIMARIA';
  if (s.includes('BACHILLERATO')) return /INCOMPLET/.test(s) ? 'BACHILLERATO_INCOMPLETO' : 'BACHILLERATO';
  if (s.includes('UTU')) return null;
  if (s.includes('CICLO BASICO') && /NO APROBADO|INCOMPLET|NO DEFINIDO|PRIMER|PRIMERO|SEGUNDO|1RO|2DO|1ER/.test(s)) return 'CICLO_BASICO_INCOMPLETO';
  if (s.includes('CICLO BASICO')) return 'CICLO_BASICO';
  if (/^(PRIMER|SEGUNDI?O|1ER|1RO|2DO)\b/.test(s.trim())) return 'CICLO_BASICO_INCOMPLETO';
  if (/3ERO?\.? SECUNDARIA (COMPLET|APROBAD)/.test(s)) return 'CICLO_BASICO';
  if (/4TO\.? SECUNDARIA/.test(s)) return 'BACHILLERATO_INCOMPLETO';
  if (/SECUNDARIA COMPLET/.test(s)) return 'BACHILLERATO';
  return null;
}

// ── Cursos de pasaje de grado ────────────────────────────────────────────────

/**
 * Columna de EFECTIVOSSUB → curso del catálogo, con el nombre de seed_ascensos.sql (las reglas de
 * ascenso exigen ese curso). El de Cbo. 1.ª a Sgto. no tiene columna en el Access.
 */
export const CURSOS_PASAJE: Record<string, { nombre: string; institucion: string }> = {
  'CSOCBO2ª-CBO1ª': { nombre: 'Curso de Pasaje de Grado de Cbo. 2.ª para Cbo. 1.ª (M-02)', institucion: 'Escuela Técnica de Aeronáutica' },
  'CSOSGTO-SGTO1º': { nombre: 'Curso de Pasaje de Grado de Sgto. para Sgto. 1ro. (M-03)', institucion: 'Escuela Técnica de Aeronáutica' },
};

/**
 * "SI (2017) ACTA Nº 1234", "SI(2022)CETA 123/22", "2006", "CCETA N° 1234/24" → aprobado, con el
 * acta (o memo) que lo registra. null si el texto no dice que lo aprobó: "Mutación O.C.G.F.A. …"
 * (la mutación exime del curso, no es haberlo hecho), "0" o basura.
 */
export function cursoAprobado(v: unknown): { acta: string | null } | null {
  const t = texto(v);
  if (!t) return null;
  const s = sinTildes(t).toUpperCase();
  const aprobado = /^SI\b/.test(s) || /^(19|20)\d{2}$/.test(s) || /^(CC|CETA|CCETA|CECFAU|CCFAU|C\.C\.E\.T\.A)/.test(s);
  if (!aprobado) return null;
  return { acta: actaDeTexto(t) };
}

/** Lo que sigue al "SI (año)": el acta, CETA o memo. */
function actaDeTexto(t: string): string | null {
  const acta = t.replace(/^s[ií]\b\s*/i, '').replace(/^\(?\s*(19|20)\d{2}\s*\)?/, '').replace(/^[\s()-]+|[\s()]+$/g, '');
  return acta ? acta.slice(0, 50) : null;
}

const INSTRUCTORES = { nombre: 'Curso de Formación de Instructores (Nivel 7)', institucion: 'Escuela Técnica de Aeronáutica' };
const SUPERVISORES = { nombre: 'Curso de Formación de Supervisores (Nivel 9)', institucion: 'Escuela Técnica de Aeronáutica' };

/**
 * NIVEL_PER (nivel de pericia 3/5/7/9) → cursos aprobados. El nivel 7 o 9 se obtiene aprobando su
 * curso o presentando el certificado de uno equivalente (lo confirmó el usuario): las dos cosas
 * cumplen el requisito de ascenso, y el Access no dice cuál fue. El nivel 9 incluye el 7: se llega
 * desde Sgto. 1.º / Inst. AT, grado que ya exige el curso de instructores.
 */
export function cursosPorNivel(v: unknown): Array<{ nivel: 7 | 9; curso: { nombre: string; institucion: string } }> {
  const n = normalizarEntero(v);
  if (n === 9) return [{ nivel: 7, curso: INSTRUCTORES }, { nivel: 9, curso: SUPERVISORES }];
  if (n === 7) return [{ nivel: 7, curso: INSTRUCTORES }];
  return [];
}

/** ACTA DE NIVEL 7: "1234", "CC 1234", "SI(2025)", "CCETA. N°123/24"; "0" es sin dato. */
export function actaNivel(v: unknown): string | null {
  const t = texto(v);
  if (!t || t === '0') return null;
  // Sin "SI" adelante, un número de cuatro cifras es el acta, no un año.
  return /^s[ií]\b/i.test(t) ? actaDeTexto(t) : t.slice(0, 50);
}

// ── Ascensos ─────────────────────────────────────────────────────────────────

/** Escalas de subalternos y aerotécnicos, de menor a mayor (las mismas que ESCALERA_FAU del backend). */
const ESCALAS_SUBALTERNOS = [
  ['SDO_2DA', 'SDO_1RA', 'CBO_2DA', 'CBO_1RA', 'SGTO', 'SGTO_1RO', 'SOM'],
  ['AT_2DA', 'AT_1RA', 'AT_PPAL', 'INST_AT', 'SUP_AT'],
];

/**
 * Grado desde el que se asciende al de `codigo`: el anterior en su escala. null si es el primero de
 * su escala o no está en una de subalternos (cadetes, At. 3.ª): ahí no hay ascenso que registrar.
 */
export function gradoAnteriorSubalterno(codigo: string): string | null {
  for (const escala of ESCALAS_SUBALTERNOS) {
    const i = escala.indexOf(codigo);
    if (i > 0) return escala[i - 1];
  }
  return null;
}

/**
 * Columnas de xescala con el año en que el oficial llegó a cada grado, de menor a mayor. La de
 * Alf. es el egreso de la EMA (coincide con FECHA EGRESO): es el grado de partida, no un ascenso.
 */
export const ANIOS_GRADO_OFICIAL: Array<[columna: string, codigo: string]> = [
  ['Alf', 'ALF'], ['Tte2', 'TTE_2DO'], ['Tte1', 'TTE_1RO'], ['Cap', 'CAP'], ['May', 'MAY'],
  ['TteCnel', 'TTE_CNEL'], ['Cnel', 'CNEL'], ['BrigGral', 'BRIG_GRAL'], ['Gral del Aire', 'GRAL'],
];

/** Año de una columna de xescala; 0 y vacío son "sin dato". */
export function anioAscenso(v: unknown): number | null {
  const n = normalizarEntero(v);
  return n !== null && n >= 1900 && n <= 2100 ? n : null;
}

// ── Servicio anterior ────────────────────────────────────────────────────────

/**
 * FUERZA 1 que nombra a la propia FAU (C.G.F.A., F.A.U., una base aérea, la banda): es un período
 * anterior en la misma fuerza, no servicio en otra.
 */
export function esLaFau(v: unknown): boolean {
  const s = sinTildes(texto(v) ?? '').toUpperCase();
  return /C\.?\s?G\.?\s?F\.?\s?A|\bF\.?\s?A\.?\s?U\b|FUERZA AEREA|\bBANDA\b|\bB\.?\s?A\.?\s?(I{1,3}|[123])\b/.test(s);
}

/** Años completos entre dos fechas ISO; null si falta alguna o no están en orden. */
export function aniosEntre(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta || hasta <= desde) return null;
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  return a2 - a1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

// ── Familia de los oficiales ─────────────────────────────────────────────────

const FECHAS = /\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*\d{2,4}/g;
// Cédula con o sin puntos y con el dígito verificador pegado o tras un guion. Un " - " entre dos
// cédulas no se confunde con el verificador: después del dígito no puede seguir otro.
const CEDULAS = /\d{1,2}\.?\d{3}\.?\d{3}(?:\s*-\s*\d(?!\d))?/g;

/**
 * Hijos de una fila de xescala. Las tres celdas traen varios hijos separados por guion, coma o
 * barra ("JUAN - MARIA", "12345678 - 23456789"); se alinean por orden. Si la cantidad de nombres
 * y de cédulas no coincide, no se puede saber cuál es cuál: error.
 */
export function hijosDeFila(nombres: unknown, cedulas: unknown, fechas: unknown):
  { hijos: Array<{ nombre: string; cedula: string; fecha: string | null }> } | { error: string } | null {
  const tc = texto(cedulas);
  if (!tc) return null;
  const ces = tc.match(CEDULAS) ?? [];
  if (!ces.length) return { error: `la columna de cédulas de los hijos no trae cédulas ("${tc.replace(/\d/g, '9')}")` };
  const ns = (texto(nombres) ?? '').split(/\s*[-,/]\s*/).map((n) => n.trim()).filter(Boolean);
  if (ns.length !== ces.length) return { error: `${ns.length} nombres de hijos y ${ces.length} cédulas: no se puede saber cuál es cuál` };
  const fs = (texto(fechas) ?? '').match(FECHAS) ?? [];
  return {
    hijos: ns.map((nombre, i) => ({
      nombre, cedula: ces[i].replace(/\s/g, ''),
      fecha: fs.length === ns.length ? normalizarFecha(fs[i].replace(/\s/g, '').replace(/-/g, '/')) : null,
    })),
  };
}

// ── Lugar de nacimiento (subalternos) ────────────────────────────────────────

/**
 * DEPT_NAC: código del departamento de nacimiento, del 1 al 19 en orden alfabético. Verificado
 * cruzándolo con el departamento del domicilio en la copia (5 → Durazno, 8 → Lavalleja,
 * 9 → Maldonado, 10 → Montevideo). 0 y cualquier otro número son "sin dato".
 */
const DEPARTAMENTOS = ['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja',
  'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó',
  'Treinta y Tres'];

export function departamentoNacimiento(v: unknown): string | null {
  const n = normalizarEntero(v);
  return n !== null && n >= 1 && n <= 19 ? DEPARTAMENTOS[n - 1] : null;
}

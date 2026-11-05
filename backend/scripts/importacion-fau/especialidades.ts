/**
 * Especialidades de subalternos (ABRE_ESP, ESPEC2) y cursos de la ETA (CURSOS ETA) → cursos del
 * catálogo. El sistema no tiene un campo de especialidad: se obtiene aprobando un curso, así que va
 * como curso aprobado ("Especialidad: …").
 *
 * Son texto libre con cientos de variantes de escritura. Cada patrón de abajo agrupa las variantes
 * frecuentes que se vieron en la copia anonimizada; lo que no coincide con ninguno va al informe.
 * Un texto puede coincidir con varios ("POLICIA AEREA DEFENSA DE INSTALACIONES"): se cargan todos.
 */
import { sinTildes, texto } from './normalizar.js';

export interface CursoCatalogo {
  nombre: string;
  institucion: string;
}

const ETA = 'Escuela Técnica de Aeronáutica';
const esp = (nombre: string): CursoCatalogo => ({ nombre: `Especialidad: ${nombre}`, institucion: ETA });

/** Los mismos nombres que seed_ascensos.sql, para que cuenten como requisito de ascenso. */
const NIVEL_7: CursoCatalogo = { nombre: 'Curso de Formación de Instructores (Nivel 7)', institucion: ETA };
const NIVEL_9: CursoCatalogo = { nombre: 'Curso de Formación de Supervisores (Nivel 9)', institucion: ETA };
const PASAJE_SGTO: CursoCatalogo = { nombre: 'Curso de Pasaje de Grado de Sgto. para Sgto. 1ro. (M-03)', institucion: ETA };

/** Patrones sobre el texto normalizado (sin tildes, mayúsculas, solo letras, dígitos y espacios). */
const PATRONES: Array<[RegExp, CursoCatalogo]> = [
  [/\bPOLICIA AEREA\b|\bP(OL)? AEREA\b/, esp('Policía Aérea')],
  [/\bDEFENSA DE IN?S?TALACION(ES)?\b/, esp('Defensa de Instalaciones')],
  [/\bOPERADOR (P ?C|WORD|EXCEL|WINDOWS?)\b|\bOP (PC|EXCELL?|PROC|P POINT)\b|\bMICROSOFT\b|^P POINT$/, esp('Operador PC')],
  [/\bDACTILOGRAF/, esp('Dactilografía')],
  [/\bCONDUCTOR\b|\bCOND (DE )?VEHICULOS\b|\bCHOFER\b/, esp('Conductor de Vehículos')],
  [/\bALBANIL/, esp('Albañilería')],
  [/\bCOCINA\b|\bALIMENT|\bCOCINERO\b/, esp('Alimentación y Cocina')],
  [/\bMOZO\b/, esp('Mozo')],
  [/\bPANADER/, esp('Panadería')],
  [/\bABASTECIMIENTO\b/, esp('Abastecimiento')],
  [/\bJARDI/, esp('Jardinería')],
  [/\bELECTRONICA\b/, esp('Electrónica')],
  [/\bAVIONICA\b/, esp('Aviónica')],
  [/\bINSTRUMENTOS\b|\bMANT INSTRUM/, esp('Instrumentos')],
  [/\bMOTOPROPULSOR\b|\bPLANTAS? DE PODER\b|\bMOTOR (A )?REACCION\b|\bMOT REAC\b|\bHELICES\b|\bTURBINAS?\b|\bMOTOR RECIPROCO\b|\bMEC MOTOR REC\b|\bMEC MOT RECIP\b/,
    esp('Sistema Motopropulsor (Planta de Poder)')],
  [/\bPINTURA\b|\bPINTOR\b/, esp('Pintura')],
  [/\bCARPINTER/, esp('Carpintería')],
  [/\bENFERMER/, esp('Enfermería')],
  [/\b(MEC(ANIC[OA])?|MANT(ENIM)?) (GRAL|GENERAL)( DE AVION)?\b|\bMECANICO GENERAL\b/, esp('Mecánico General de Avión')],
  [/\bHELIC(OPTEROS?|OP)?\b/, esp('Mecánico de Helicóptero')],
  [/\bMETEOROLOG/, esp('Meteorología')],
  [/\bBANDA DE MUSICA\b|\bMUSICO\b/, esp('Música')],
  [/\bMANT(ENIMIENTO|ENIM)? (DE )?(AERON|AVION)|\bMANT AERONAUTICO\b|\bCTRL MANTENIM\b/, esp('Mantenimiento de Aeronaves')],
  [/\b(CURSO |CSO )?(REG(ULAR)? )?BASICO ?DE MANT\b/,
    { nombre: 'Curso Regular Básico de Mantenimiento', institucion: ETA }],
  [/\bHERRER/, esp('Herrería')],
  [/\bMEC(ANIC[OA])? AUTOMOTRIZ\b/, esp('Mecánica Automotriz')],
  [/\bOPERACIONES ESPECIALES\b/, esp('Operaciones Especiales')],
  [/\bINST(ALACIONES|AL)? EL[A-Z]*\b|\bELECTRICIDAD\b|\bELECTRICISTA\b/, esp('Instalaciones Eléctricas')],
  [/\bSANITARIAS?\b|\bPLOMERIA\b/, esp('Instalaciones Sanitarias')],
  [/\bCOMUNICACION(ES)?\b|\bTELEFONISTA\b|\bCTRAL TEL\b/, esp('Comunicaciones')],
  [/\bESTRUC|\bEST DE AVION\b|\bCELULA\b/, esp('Estructura y Célula')],
  [/\bHIDRAULICA\b|\bNEUMOH/, esp('Sistema Neumohidráulico')],
  [/\bRESCATISTA\b/, esp('Rescatista')],
  [/\bTAREAS RURALES\b/, esp('Tareas Rurales')],
  [/\bFARMACIA\b/, esp('Farmacia')],
  [/\bPELUQUER/, esp('Peluquería')],
  [/\bTORNER/, esp('Tornería')],
  [/\bAUXILIAR CONTABLE\b|\bADMINISTRACION\b/, esp('Administración')],
  [/\bARMAMENTO\b|\bARM TERRESTRE\b/, esp('Armamento')],
  [/\bFOTO/, esp('Fotografía y Filmación')],
  [/\b(MANDO|COMANDO) Y CONTROL\b|\b(SIST|SISTEMA) (DE )?(COM|CDO) Y? ?(CTRL|CONTR)|\bCOM Y CTRL\b|\bCONTROL AEROESPACIAL\b/, esp('Operador de Sistema de Mando y Control')],
  [/\b(CTRL|CONTR) TRANS AER|\bCONTROL(ADOR)? DE TRANSITO AEREO\b/, esp('Control de Tránsito Aéreo')],
  [/\bCONTROLADOR SAR\b/, esp('Controlador SAR')],
  [/\bASISTENTE DENTAL\b/, esp('Asistente Dental')],
  [/\bED(UCACION)?( FISICA)? Y RECREACION\b/, esp('Educación Física y Recreación')],
  [/\bLABORATORIO\b/, esp('Laboratorio')],
  [/\bINTELIGENCIA\b/, esp('Inteligencia')],
  [/\bSERVICIOS GENERALES\b|\bPEON AYUDANTE\b/, esp('Servicios Generales')],
  [/\bAPOYO AL VUELO\b/, esp('Apoyo al Vuelo')],
  [/\bMANT? SIS EL(EC)?\b|\bMAN EQ EL\b/, esp('Sistema Eléctrico de Aeronaves')],
  [/\bCARNICERIA\b|\bCORTADOR DE CARNE\b/, esp('Carnicería')],
  [/\bPROGRAMACION\b/, esp('Programación')],
  [/\bDIBUJO\b/, esp('Dibujo')],
  [/\bAVANZ(ADO)? (DE )?MANT/, { nombre: 'Curso Avanzado de Mantenimiento', institucion: ETA }],
  [/\bAVSEC\b/, { nombre: 'Curso AVSEC 123 (seguridad de la aviación)', institucion: ETA }],
  // Cursos que ya están en el catálogo de ascensos.
  [/\bINSTRUCTORES\b.*\bNIVEL 7\b|\bCECFAU N \d+ \d+ NIVEL 7\b|^FORMACION DE INSTRUCTORES$/, NIVEL_7],
  [/\bSUPERVIS|\bCSO SUPV\b|\bNIVEL 9\b/, NIVEL_9],
  [/\bPASAJE (DE )?(GRADO|GDO) (DE )?SGTO A SGTO 1\b/, PASAJE_SGTO],
];

/**
 * Títulos profesionales y textos que no son un curso ("NO TIENE C.I.R.", "SIN CURSO …"). No se
 * cargan ni se informan: el título universitario tiene su propia columna, que no se importa.
 */
const NO_ES_CURSO = /^(DR|DRA|DOCTORA?|LIC|LICENCIAD[OA]|PSICOLOG[OA]|ABOGAD[OA]|ARQUITECT[OA]|ESCRIBAN[OA]|CONTADORA?|INGENIER[OA]|AS(ISTENTE)? SOCIAL|ODONTOLOG[OA])\b|\bEN (MEDICINA|ODONTOLOGIA|PSICOLOGIA|DERECHO)\b|^(NO TIENE|SIN CURSO|SI TIENE|SI|NO|\d{4})\b/;

const normalizar = (t: string) => sinTildes(t).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/**
 * Cursos que implica un texto de especialidad o de CURSOS ETA. `[]` con `reconocido: true` si el
 * texto no es un curso (título, "NO TIENE C.I.R."); `reconocido: false` si no coincide con ningún patrón.
 */
export function cursosDeEspecialidad(v: unknown): { cursos: CursoCatalogo[]; reconocido: boolean } | null {
  const t = texto(v);
  if (!t || t === '0') return null;
  const s = normalizar(t);
  if (!s) return null;
  const cursos = PATRONES.filter(([re]) => re.test(s)).map(([, c]) => c);
  const unicos = [...new Map(cursos.map((c) => [c.nombre, c])).values()];
  if (unicos.length) return { cursos: unicos, reconocido: true };
  return { cursos: [], reconocido: NO_ES_CURSO.test(s) };
}

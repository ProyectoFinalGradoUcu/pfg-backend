import {
  esMutado,
  esNivelLiceal,
} from '../subalternos/legajo-militar.constants.js';
import { ESCALERA_FAU } from './ascensos.constants.js';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type EstadoElegibilidad =
  | 'PASIBLE'
  | 'PROXIMO'
  | 'BLOQUEADO'
  | 'FUERA_DE_EDAD'
  | 'SIN_REGLA'
  | 'TOPE_DE_ESCALA';

export type EstadoCurso =
  | 'APROBADO'
  | 'EN_CURSO'
  | 'NO_APROBADO'
  | 'DADO_DE_BAJA'
  | 'NO_REALIZADO';

export interface CursoEvaluado {
  id: string;
  nombre: string;
  estado: EstadoCurso;
}

export interface RequisitoEvaluado {
  tipo: string;
  descripcion: string;
  /** false = no le corresponde a esta persona; no cuenta como incumplido. */
  aplica: boolean;
  cumple: boolean;
  detalle: string;
  valor?: number;
  esperado?: number;
  fecha_cumpliria?: string | null;
  cursos?: CursoEvaluado[];
}

export interface DatosFuncionario {
  persona: {
    id: string;
    cedula: string;
    nombre: string;
    apellido: string;
    fecha_nacimiento: Date | null;
  };
  relacion: {
    id: string;
    fecha_inicio: Date;
    fecha_ultimo_ascenso: Date | null;
    mutaciones: string | null;
    anios_servicio_anterior: number;
  };
  grado: { id: string; codigo: string; denominacion: string; orden: number };
  situacion: { id: string; codigo: string; denominacion: string } | null;
  unidad: { id: string; denominacion: string } | null;
  escalafon: { id: string; denominacion: string } | null;
  legajo: { nivel_educativo: string | null; fecha_egreso_eta: Date | null } | null;
  cursos: Map<string, { aprobado: boolean | null; dado_de_baja: boolean }>;
  retiro: { fecha_retiro: Date | null } | null;
}

export interface RequisitoDeRegla {
  tipo: string;
  descripcion: string;
  modo: string;
  aplica_si: string[];
  parametros: Record<string, unknown> | null;
  orden: number;
  cursos: { id: string; nombre: string }[];
}

export interface ReglaEvaluable {
  id: string;
  nombre: string;
  grado_origen_id: string;
  grado_destino: { id: string; codigo: string; denominacion: string; orden: number };
  dias_minimos: number;
  edad_maxima: number | null;
  requisitos: RequisitoDeRegla[];
}

export interface OpcionesEvaluacion {
  fecha_referencia: Date;
  situaciones_elegibles: string[];
  situaciones_bloqueantes: string[];
}

export interface ResultadoElegibilidad {
  persona: {
    id: string;
    cedula: string;
    nombre_completo: string;
    apellido: string;
    unidad: { id: string; denominacion: string } | null;
    escalafon: { id: string; denominacion: string } | null;
    situacion: { id: string; codigo: string; denominacion: string } | null;
  };
  grado_actual: { id: string; codigo: string; denominacion: string; orden: number };
  grado_destino: { id: string; codigo: string; denominacion: string; orden: number } | null;
  regla: { id: string; nombre: string } | null;
  estado: EstadoElegibilidad;
  /** Solo cuando lo único que falta es tiempo en el grado. */
  fecha_cumpliria: string | null;
  motivo: string | null;
  antiguedad_dias: number;
  edad: number | null;
  requisitos: RequisitoEvaluado[];
}

// ─── Utilidades de fecha ────────────────────────────────────────────────────

const UN_DIA = 24 * 60 * 60 * 1000;

export const soloFecha = (fecha: Date | null | undefined): string | null =>
  fecha ? fecha.toISOString().split('T')[0] : null;

export const diasEntre = (desde: Date, hasta: Date): number =>
  Math.floor((hasta.getTime() - desde.getTime()) / UN_DIA);

export const sumarDias = (fecha: Date, dias: number): Date =>
  new Date(fecha.getTime() + dias * UN_DIA);

/** Años cumplidos a la fecha de referencia. */
export const edadA = (nacimiento: Date, referencia: Date): number => {
  let edad = referencia.getUTCFullYear() - nacimiento.getUTCFullYear();
  const mes = referencia.getUTCMonth() - nacimiento.getUTCMonth();
  if (mes < 0 || (mes === 0 && referencia.getUTCDate() < nacimiento.getUTCDate())) {
    edad--;
  }
  return edad;
};

/** "1 año 4 meses". */
export const duracionLegible = (dias: number): string => {
  if (dias < 0) return '0 días';
  const anios = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);
  const partes: string[] = [];
  if (anios > 0) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mes' : 'meses'}`);
  if (partes.length === 0) return `${dias} ${dias === 1 ? 'día' : 'días'}`;
  return partes.join(' ');
};

/** Último escalón de cada columna: de ahí no se asciende. */
const TOPES_DE_ESCALA = new Set(
  ESCALERA_FAU.map((g) => g.grados[g.grados.length - 1] as string),
);

// ─── Evaluación ─────────────────────────────────────────────────────────────

/** Con que se cumpla una de las condiciones de `aplica_si`, el requisito aplica. */
export function requisitoAplica(
  condiciones: string[],
  datos: DatosFuncionario,
): boolean {
  if (!condiciones?.length) return true;

  return condiciones.some((cond) => {
    switch (cond) {
      case 'SIEMPRE':
        return true;
      case 'ES_MUTADO':
        return esMutado(datos.relacion.mutaciones);
      case 'NO_ES_MUTADO':
        return !esMutado(datos.relacion.mutaciones);
      case 'EGRESADO_ETA':
        return datos.legajo?.fecha_egreso_eta != null;
      case 'NO_EGRESADO_ETA':
        return datos.legajo?.fecha_egreso_eta == null;
      case 'NIVEL_LICEAL':
        return esNivelLiceal(datos.legajo?.nivel_educativo);
      default:
        // Una condición desconocida no habilita nada.
        return false;
    }
  });
}

/** El requisito se cumple solo con `aprobado = true` y `dado_de_baja = false`. */
export function estadoDelCurso(
  registro: { aprobado: boolean | null; dado_de_baja: boolean } | undefined,
): EstadoCurso {
  if (!registro) return 'NO_REALIZADO';
  if (registro.dado_de_baja) return 'DADO_DE_BAJA';
  if (registro.aprobado === true) return 'APROBADO';
  if (registro.aprobado === false) return 'NO_APROBADO';
  return 'EN_CURSO';
}

const ETIQUETA_CURSO: Record<EstadoCurso, string> = {
  APROBADO: 'aprobado',
  EN_CURSO: 'en curso',
  NO_APROBADO: 'no aprobado',
  DADO_DE_BAJA: 'dado de baja',
  NO_REALIZADO: 'no realizado',
};

function evaluarAntiguedad(
  datos: DatosFuncionario,
  regla: ReglaEvaluable,
  fechaRef: Date,
): RequisitoEvaluado & { fecha_cumpliria: string | null } {
  // La relación vigente se abre en cada ascenso, así que `fecha_inicio` sirve
  // de respaldo cuando falta la fecha del último.
  const base = datos.relacion.fecha_ultimo_ascenso ?? datos.relacion.fecha_inicio;
  const dias = diasEntre(base, fechaRef);
  const cumple = dias >= regla.dias_minimos;
  const fechaCumpliria = soloFecha(sumarDias(base, regla.dias_minimos));

  return {
    tipo: 'ANTIGUEDAD',
    descripcion: 'Antigüedad en el grado',
    aplica: true,
    cumple,
    detalle: `${duracionLegible(dias)} de ${duracionLegible(regla.dias_minimos)}`,
    valor: dias,
    esperado: regla.dias_minimos,
    fecha_cumpliria: cumple ? null : fechaCumpliria,
  };
}

function evaluarEdad(
  datos: DatosFuncionario,
  regla: ReglaEvaluable,
  fechaRef: Date,
): { requisito: RequisitoEvaluado | null; edad: number | null } {
  if (regla.edad_maxima == null) return { requisito: null, edad: edadDe(datos, fechaRef) };

  const nacimiento = datos.persona.fecha_nacimiento;
  if (!nacimiento) {
    // Sin fecha de nacimiento no se puede afirmar que esté en edad.
    return {
      requisito: {
        tipo: 'EDAD',
        descripcion: 'Edad',
        aplica: true,
        cumple: false,
        detalle: `sin fecha de nacimiento cargada (máximo ${regla.edad_maxima})`,
        esperado: regla.edad_maxima,
      },
      edad: null,
    };
  }

  const edad = edadA(nacimiento, fechaRef);
  return {
    requisito: {
      tipo: 'EDAD',
      descripcion: 'Edad',
      aplica: true,
      cumple: edad < regla.edad_maxima,
      detalle: `${edad} años (máximo ${regla.edad_maxima - 1})`,
      valor: edad,
      esperado: regla.edad_maxima,
    },
    edad,
  };
}

const edadDe = (datos: DatosFuncionario, fechaRef: Date): number | null =>
  datos.persona.fecha_nacimiento ? edadA(datos.persona.fecha_nacimiento, fechaRef) : null;

function evaluarRequisitoDeRegla(
  req: RequisitoDeRegla,
  datos: DatosFuncionario,
  fechaRef: Date,
): RequisitoEvaluado {
  const aplica = requisitoAplica(req.aplica_si, datos);

  if (!aplica) {
    return {
      tipo: req.tipo,
      descripcion: req.descripcion,
      aplica: false,
      cumple: true,
      detalle: 'No aplica a este funcionario',
    };
  }

  if (req.tipo === 'ANTIGUEDAD_SERVICIO') {
    const aniosMinimos = Number(req.parametros?.['anios_minimos'] ?? 0);
    const dias = diasEntre(datos.relacion.fecha_inicio, fechaRef);
    const anios = Math.floor(dias / 365) + (datos.relacion.anios_servicio_anterior ?? 0);
    return {
      tipo: req.tipo,
      descripcion: req.descripcion,
      aplica: true,
      cumple: anios >= aniosMinimos,
      detalle: `${anios} años de servicio de ${aniosMinimos}`,
      valor: anios,
      esperado: aniosMinimos,
    };
  }

  const cursos: CursoEvaluado[] = req.cursos.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    estado: estadoDelCurso(datos.cursos.get(c.id)),
  }));

  const aprobados = cursos.filter((c) => c.estado === 'APROBADO');
  const cumple =
    cursos.length === 0
      ? false
      : req.modo === 'ALGUNO'
        ? aprobados.length > 0
        : aprobados.length === cursos.length;

  const detalle =
    cursos.length === 0
      ? 'El requisito no tiene ningún curso vinculado: no se puede evaluar'
      : cursos.map((c) => `${c.nombre}: ${ETIQUETA_CURSO[c.estado]}`).join(' · ');

  return {
    tipo: req.tipo,
    descripcion: req.descripcion,
    aplica: true,
    cumple,
    detalle,
    cursos,
  };
}

/**
 * Evalúa a un funcionario contra la regla vigente de su grado. No toca la base:
 * se le pasa todo lo que necesita. Los bloqueos se miran primero, pero igual se
 * explica el motivo.
 */
export function evaluarFuncionario(
  datos: DatosFuncionario,
  regla: ReglaEvaluable | null,
  opciones: OpcionesEvaluacion,
): ResultadoElegibilidad {
  const fechaRef = opciones.fecha_referencia;

  const base = {
    persona: {
      id: datos.persona.id,
      cedula: datos.persona.cedula,
      nombre_completo: `${datos.persona.nombre} ${datos.persona.apellido}`.trim(),
      apellido: datos.persona.apellido,
      unidad: datos.unidad,
      escalafon: datos.escalafon,
      situacion: datos.situacion,
    },
    grado_actual: datos.grado,
    antiguedad_dias: diasEntre(
      datos.relacion.fecha_ultimo_ascenso ?? datos.relacion.fecha_inicio,
      fechaRef,
    ),
    edad: edadDe(datos, fechaRef),
  };


  if (datos.retiro) {
    return {
      ...base,
      grado_destino: regla?.grado_destino ?? null,
      regla: regla ? { id: regla.id, nombre: regla.nombre } : null,
      estado: 'BLOQUEADO',
      fecha_cumpliria: null,
      motivo: datos.retiro.fecha_retiro
        ? `Tiene retiro registrado el ${soloFecha(datos.retiro.fecha_retiro)}`
        : 'Tiene un retiro registrado',
      requisitos: [],
    };
  }

  const codigoSituacion = datos.situacion?.codigo ?? null;
  const bloqueaSituacion =
    codigoSituacion == null ||
    opciones.situaciones_bloqueantes.includes(codigoSituacion) ||
    !opciones.situaciones_elegibles.includes(codigoSituacion);

  if (bloqueaSituacion) {
    return {
      ...base,
      grado_destino: regla?.grado_destino ?? null,
      regla: regla ? { id: regla.id, nombre: regla.nombre } : null,
      estado: 'BLOQUEADO',
      fecha_cumpliria: null,
      motivo: codigoSituacion
        ? `Su situación (${datos.situacion?.denominacion}) no habilita el ascenso`
        : 'No tiene situación de revista cargada',
      requisitos: [],
    };
  }


  if (!regla) {
    const esTope = TOPES_DE_ESCALA.has(datos.grado.codigo);
    return {
      ...base,
      grado_destino: null,
      regla: null,
      estado: esTope ? 'TOPE_DE_ESCALA' : 'SIN_REGLA',
      fecha_cumpliria: null,
      motivo: esTope
        ? 'Está en el último grado de su escala'
        : 'No hay una regla de ascenso cargada para su grado',
      requisitos: [],
    };
  }


  const antiguedad = evaluarAntiguedad(datos, regla, fechaRef);
  const { requisito: reqEdad, edad } = evaluarEdad(datos, regla, fechaRef);
  const propios = [...regla.requisitos]
    .sort((a, b) => a.orden - b.orden)
    .map((r) => evaluarRequisitoDeRegla(r, datos, fechaRef));

  const requisitos: RequisitoEvaluado[] = [
    antiguedad,
    ...(reqEdad ? [reqEdad] : []),
    ...propios,
  ];

  const incumplidos = requisitos.filter((r) => r.aplica && !r.cumple);
  const soloFaltaTiempo =
    incumplidos.length === 1 && incumplidos[0].tipo === 'ANTIGUEDAD';

  let estado: EstadoElegibilidad;
  let motivo: string | null = null;

  if (reqEdad && !reqEdad.cumple && datos.persona.fecha_nacimiento) {
    // Fuera de edad es definitivo para esta regla: no es un pendiente.
    estado = 'FUERA_DE_EDAD';
    motivo = `Superó la edad máxima de la regla (${regla.edad_maxima})`;
  } else if (incumplidos.length === 0) {
    estado = 'PASIBLE';
  } else if (soloFaltaTiempo) {
    estado = 'PROXIMO';
    motivo = `Le falta tiempo en el grado; lo cumple el ${antiguedad.fecha_cumpliria}`;
  } else {
    estado = 'BLOQUEADO';
    motivo = incumplidos.map((r) => r.descripcion).join(', ');
  }

  return {
    ...base,
    edad,
    grado_destino: regla.grado_destino,
    regla: { id: regla.id, nombre: regla.nombre },
    estado,
    fecha_cumpliria: soloFaltaTiempo ? antiguedad.fecha_cumpliria : null,
    motivo,
    requisitos,
  };
}

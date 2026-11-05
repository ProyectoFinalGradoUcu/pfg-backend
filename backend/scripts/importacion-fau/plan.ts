/**
 * Arma el plan de importación: qué se crearía y qué no, y por qué. No escribe nada en la base.
 *
 * Reglas (acordadas, ver LEEME.md):
 *  - La persona se identifica por cédula. Si ya existe, no se le pisa ningún dato: solo se
 *    completan los campos vacíos.
 *  - Los períodos de baja entran como relaciones laborales inactivas (liquidación no las toca).
 *  - Nunca se crea una segunda relación activa. Una relación activa nueva solo se crea con
 *    --crear-activos y si el grado tiene remuneración cargada (si no, liquidación falla).
 *  - Volver a correr no duplica: un período con la misma persona, fecha de ingreso y grado se saltea.
 */
import { PoolClient } from 'pg';
import { Catalogos, Ref } from './catalogos.js';
import {
  actaNivel, aniosEntre, anioAscenso, ANIOS_GRADO_OFICIAL, claveMision, cursoAprobado, CURSOS_PASAJE, cursosPorNivel,
  departamentoNacimiento, esLaFau, gradoAnteriorSubalterno, hijosDeFila, leerMisiones, MisionLeida, nivelEducativo,
} from './complementos.js';
import { CursoCatalogo, cursosDeEspecialidad } from './especialidades.js';
import { conductaDeMotivo, motivoBaja, MOTIVOS_NUEVOS } from './motivos.js';
import { BaseAccess, Fila, HojaVuelo } from './leer.js';
import {
  Cedula, clave, normalizarCedula, normalizarDecimal, normalizarEntero, normalizarFecha, palabras,
  partesNombre, separarNombre, texto,
} from './normalizar.js';

export interface Opciones {
  crearActivos: boolean;
  crearCatalogos: boolean;
}

export interface Incidencia {
  nivel: 'error' | 'aviso';
  origen: string;
  cedula?: string;
  nombre?: string;
  motivo: string;
}

export interface PersonaNueva {
  ref: Ref;
  cedula: string;
  datos: Record<string, unknown>;
}

export interface RelacionNueva {
  persona: Ref;
  campos: Record<string, unknown>; // columnas de relaciones_laborales; los Ref se resuelven al aplicar
  origen: string;
}

export interface DestinoNuevo {
  persona: Ref;
  unidad: Ref;
  fechaInicio: string | null;
  fechaFin: string | null;
  numeroOrden: string | null;
  posicion: string | null;
  observaciones: string;
}

export interface VueloNuevo {
  persona: Ref;
  periodo: { anio: number; numero: number };
  campos: Record<string, unknown>;
}

export interface MisionNueva {
  existenteId: string | null; // misión que ya está en la base (se le agregan participantes)
  campos: MisionLeida['campos'];
  participantes: Set<Ref>;
}

export interface Plan {
  personasNuevas: Map<string, PersonaNueva>; // por cédula
  completar: Array<{ personaId: string; campos: Record<string, unknown> }>;
  relaciones: RelacionNueva[];
  destinos: DestinoNuevo[];
  vuelos: VueloNuevo[];
  /** Derecha/Numor de relaciones activas que ya existían y los tenían vacíos. */
  derechas: Array<{ relacionId: string; derecha: number | null; numor: number | null }>;
  /** Altas en historial_derecha_numor (de relaciones nuevas y completadas). */
  historial: Array<{ persona: Ref; tipo: 'DERECHA' | 'NUMOR'; valor: number; origen: string }>;
  legajos: Array<{ persona: Ref; nivel: string; actualizar: boolean }>;
  /** Cursos aprobados (funcionarios_cursos); el curso va por nombre y se crea si falta. */
  cursos: Array<{ persona: Ref; curso: string; institucion: string; numeroOrden: string | null; fecha: string | null;
    observacion: string }>;
  /** Motivos de baja que faltan en el catálogo y se crean (no vigentes), por código. */
  motivosNuevos: Set<string>;
  /** motivo_baja_id para períodos de baja que ya estaban en la base sin motivo. */
  motivosRelacion: Array<{ relacionId: string; motivo: Ref }>;
  /** conducta para períodos de baja que ya estaban en la base sin ella. */
  conductasRelacion: Array<{ relacionId: string; conducta: string }>;
  /** Retiros de los períodos de baja. `relacion` es un id de la base o "rel:N" (relación N del plan). */
  retiros: Array<{ persona: Ref; relacion: string; fecha: string; motivoBaja: Ref; motivo: string;
    numeroOrden: string | null; boletin: string | null; observaciones: string }>;
  /** Vínculos familiares: `tipo` es qué es el familiar respecto de la persona, como en la aplicación. */
  familiares: Array<{ persona: Ref; familiar: Ref; tipo: string; observaciones: string }>;
  /** Historial de ascensos: registros históricos, sin relaciones laborales asociadas. */
  ascensos: Array<{ persona: Ref; grado: Ref; gradoAnterior: Ref | null; fecha: string; observaciones: string }>;
  misiones: Map<string, MisionNueva>;
  incidencias: Incidencia[];
  conteo: Record<string, number>;
}

interface PersonaDb {
  id: string;
  cedula: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  [campo: string]: unknown;
}

/** Datos personales que se completan si están vacíos en la base. */
const CAMPOS_PERSONA = ['fecha_nacimiento', 'genero', 'telefono', 'direccion', 'codigo_postal', 'departamento',
  'localidad', 'email', 'lugar_nacimiento', 'seccional', 'fecha_fallecimiento'] as const;

const OFICIALES = new Set(['ALF', 'TTE_2DO', 'TTE_1RO', 'CAP', 'MAY', 'TTE_CNEL', 'CNEL', 'BRIG_GRAL', 'GRAL']);

export async function armarPlan(
  db: PoolClient, cat: Catalogos, bases: BaseAccess[], hojas: HojaVuelo[], op: Opciones,
): Promise<Plan> {
  const plan: Plan = {
    personasNuevas: new Map(), completar: [], relaciones: [], destinos: [], vuelos: [], derechas: [], historial: [],
    legajos: [], cursos: [], ascensos: [], motivosNuevos: new Set(), motivosRelacion: [], conductasRelacion: [], retiros: [],
    familiares: [],
    misiones: new Map(), incidencias: [], conteo: {},
  };
  const contar = (k: string, n = 1) => (plan.conteo[k] = (plan.conteo[k] ?? 0) + n);
  const incidencia = (i: Incidencia) => plan.incidencias.push(i);
  cat.usarDesnum((bases.find((b) => b.tipo === 'oficiales')?.tablas.get('DESNUM') ?? []).map((d) => d['DES']));

  // Lo que ya está en la base ────────────────────────────────────────────────
  const personasDb = new Map<string, PersonaDb>(
    (await db.query(`SELECT id::text, cedula, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
       ${CAMPOS_PERSONA.join(', ')} FROM personas`)).rows.map((p: PersonaDb) => [p.cedula, p]),
  );
  const relacionesDb = (await db.query(
    `SELECT id::text, persona_id::text AS persona, fecha_inicio::text AS inicio, grado_id::text AS grado,
            escalafon_id::text AS escalafon, unidad_id::text AS unidad, estado, derecha, numor,
            fecha_ultimo_ascenso::text AS fua, motivo_baja_id::text AS motivo, fecha_fin::text AS fin, conducta
       FROM relaciones_laborales`,
  )).rows as Array<{ id: string | null; persona: string; inicio: string; grado: string; escalafon: string; unidad: string;
    estado: string; derecha: number | null; numor: number | null; fua?: string | null; motivo?: string | null;
    fin?: string | null; conducta?: string | null }>;
  const yaImportada = new Set(relacionesDb.map((r) => `${r.persona}|${r.inicio}|${r.grado}`));
  const relacionPorClave = new Map(relacionesDb.map((r) => [`${r.persona}|${r.inicio}|${r.grado}`, r]));
  // Relaciones que ya tienen su retiro (no anulado): a cada período de baja le corresponde uno.
  const retirosDb = new Set((await db.query(
    'SELECT relacion_laboral_id::text AS r FROM retiros WHERE NOT anulado',
  )).rows.map((r: { r: string }) => r.r));
  const motivosDb = new Map<string, string>((await db.query('SELECT codigo, id::text FROM motivos_baja'))
    .rows.map((m: { codigo: string; id: string }) => [m.codigo, m.id]));
  // persona|familiar, en los dos sentidos: un vínculo se registra una sola vez.
  /** Motivo del catálogo; uno de MOTIVOS_NUEVOS que falta se crea solo con --crear-catalogos. */
  function refMotivo(codigo: string): Ref | null {
    const id = motivosDb.get(codigo);
    if (id) return id;
    if (!MOTIVOS_NUEVOS[codigo] || !op.crearCatalogos) return null;
    plan.motivosNuevos.add(codigo);
    return `nuevo:motivos_baja:${codigo}`;
  }
  const familiaresDb = new Set((await db.query(
    "SELECT persona_id || '|' || familiar_id AS a, familiar_id || '|' || persona_id AS b FROM relaciones_familiares",
  )).rows.flatMap((r: { a: string; b: string }) => [r.a, r.b]));
  // Derecha y Numor son únicos (por escala, y por grado + escalafón): se cargan solo si están libres.
  const ordenes = (await db.query(
    `SELECT escala_derecha, derecha, grado_id::text AS grado, escalafon_id::text AS escalafon, numor FROM relaciones_laborales
      WHERE derecha IS NOT NULL OR numor IS NOT NULL`,
  )).rows as Array<{ escala_derecha: string; derecha: number | null; grado: string; escalafon: string; numor: number | null }>;
  const derechasUsadas = new Set(ordenes.filter((o) => o.derecha !== null).map((o) => `${o.escala_derecha}|${o.derecha}`));
  const numorsUsados = new Set(ordenes.filter((o) => o.numor !== null).map((o) => `${o.grado}|${o.escalafon}|${o.numor}`));
  const activaDb = new Map(relacionesDb.filter((r) => r.estado === 'activo').map((r) => [r.persona, r]));
  const destinosDb = (await db.query(
    `SELECT persona_id::text AS persona, unidad_id::text AS unidad, fecha_inicio::text AS inicio,
            fecha_fin IS NULL AS activo FROM destinos`,
  )).rows as Array<{ persona: string; unidad: string; inicio: string | null; activo: boolean }>;
  const destinoExiste = new Set(destinosDb.map((d) => `${d.persona}|${d.unidad}|${d.inicio}`));
  const destinoActivo = new Set(destinosDb.filter((d) => d.activo).map((d) => d.persona));
  const vuelosDb = new Set((await db.query(
    `SELECT p.anio || '-' || p.numero || '|' || r.persona_id AS k FROM registros_vuelo r
       JOIN periodos_vuelo p ON p.id = r.periodo_id`,
  )).rows.map((r: { k: string }) => r.k));

  // persona → nivel educativo (null si tiene legajo sin nivel). No se pisa un nivel ya cargado.
  const legajosDb = new Map<string, string | null>((await db.query(
    'SELECT persona_id::text AS persona, nivel_educativo AS nivel FROM legajo_militar',
  )).rows.map((l: { persona: string; nivel: string | null }) => [l.persona, l.nivel]));
  const conLegajo = new Set<Ref>();
  // persona|nombre del curso: una persona tiene cada curso una sola vez (único en la base).
  const cursosDb = new Set((await db.query(
    `SELECT fc.persona_id || '|' || c.nombre_curso AS k FROM funcionarios_cursos fc JOIN cursos c ON c.id = fc.curso_id`,
  )).rows.map((r: { k: string }) => r.k));
  const cursosVistos = new Set<string>();
  // persona|grado de los ascensos vigentes: a cada grado se asciende una vez.
  const ascensosDb = new Set((await db.query(
    "SELECT persona_id || '|' || grado_id AS k FROM ascensos WHERE anulado_en IS NULL AND persona_id IS NOT NULL AND grado_id IS NOT NULL",
  )).rows.map((r: { k: string }) => r.k));
  const ascensosVistos = new Set<string>();

  /**
   * Un ascenso histórico. Va sin relaciones laborales (no hay forma de saber cuáles serían), y por
   * eso la aplicación no deja anularlo: es solo historial.
   */
  function agregarAscenso(a: { ced: Cedula; codigo: string; anterior: string | null; fecha: string; observaciones: string;
    origen: string; nombreTxt: string }) {
    if (!personasDb.has(a.ced.valor) && !plan.personasNuevas.has(a.ced.valor)) return;
    const persona = refPersona(a.ced.valor);
    const grado = cat.grado(a.codigo);
    const anterior = a.anterior ? cat.grado(a.anterior) : null;
    if (!grado || !usable(grado.ref) || (anterior && !usable(anterior.ref))) {
      incidencia({ nivel: 'aviso', origen: a.origen, cedula: a.ced.valor, nombre: a.nombreTxt,
        motivo: `ascenso a ${a.codigo}: el grado no está en la base (correr con --crear-catalogos): no se carga` });
      return;
    }
    const k = `${persona}|${grado.ref}`;
    if (ascensosVistos.has(k)) return;
    ascensosVistos.add(k);
    if (ascensosDb.has(k)) {
      contar('ascensos ya cargados (se saltean)');
      return;
    }
    plan.ascensos.push({ persona, grado: grado.ref, gradoAnterior: anterior?.ref ?? null, fecha: a.fecha, observaciones: a.observaciones });
    contar('ascensos a cargar');
  }
  const misionesDb = new Map<string, string>((await db.query(
    'SELECT id::text, nombre_mision, pais, fecha_salida::text AS salida, fecha_llegada::text AS llegada FROM misiones',
  )).rows.map((m: { id: string; nombre_mision: string; pais: string; salida: string; llegada: string }) =>
    [claveMision(m.nombre_mision, m.pais, m.salida, m.llegada), m.id]));
  const participantesDb = new Set((await db.query(
    "SELECT persona_id || '|' || mision_id AS k FROM funcionarios_misiones",
  )).rows.map((r: { k: string }) => r.k));

  /** Un Ref de catálogo se puede usar si existe, o si es nuevo y se permite crearlo. */
  const usable = (ref: Ref) =>
    !ref.startsWith('nuevo:') || ref.startsWith('nuevo:unidades_vuelo:') || op.crearCatalogos;

  // Personas ─────────────────────────────────────────────────────────────────
  const refPersona = (ced: string) => personasDb.get(ced)?.id ?? `nueva:${ced}`;
  const completadas = new Set<string>();

  function registrarPersona(ced: Cedula, nombre: ReturnType<typeof partesNombre>, datos: Record<string, unknown>, origen: string) {
    const existente = personasDb.get(ced.valor);
    if (existente) {
      if (completadas.has(existente.id)) return;
      completadas.add(existente.id);
      const campos = Object.fromEntries(
        Object.entries(datos).filter(([k, v]) => v !== null && v !== undefined && (existente[k] === null || existente[k] === undefined)),
      );
      if (Object.keys(campos).length) plan.completar.push({ personaId: existente.id, campos });
      return;
    }
    const previa = plan.personasNuevas.get(ced.valor);
    if (previa) {
      // Se completan los huecos con lo que traiga la otra base (p. ej. oficial que fue cadete).
      for (const [k, v] of Object.entries(datos)) if (previa.datos[k] == null && v != null) previa.datos[k] = v;
      return;
    }
    if (!nombre) {
      incidencia({ nivel: 'error', origen, cedula: ced.valor, motivo: 'persona nueva sin nombre y apellido: no se crea' });
      return;
    }
    plan.personasNuevas.set(ced.valor, { ref: `nueva:${ced.valor}`, cedula: ced.valor, datos: { ...nombre, ...datos } });
  }

  // Subalternos: cada fila es un período de servicio ─────────────────────────
  // Nombre por cédula de las hojas del Excel que traen las dos cosas: sirve de respaldo cuando el
  // Access trae el nombre sin coma y no se puede separar apellido de nombre.
  const nombreExcel = new Map<string, ReturnType<typeof partesNombre>>();
  for (const hoja of hojas) {
    for (const f of hoja.filas) {
      const ced = texto(f.cedula) ? normalizarCedula(f.cedula) : null;
      const partes = partesNombre(f.nombre);
      if (ced?.verificadorValido && partes && !nombreExcel.has(ced.valor)) nombreExcel.set(ced.valor, partes);
    }
  }

  const sub = bases.find((b) => b.tipo === 'subalternos')?.tablas.get('EFECTIVOSSUB') ?? [];
  // Escalafón conocido de cada persona, para los REIN (reincorporados, que no traen el suyo).
  const escalafonDe = new Map<string, unknown>();
  for (const f of sub) {
    const ced = normalizarCedula(f['CI'], f['CED_PERS']);
    if (ced && texto(f['ABRE_ESC']) && clave(f['ABRE_ESC']) !== 'REIN') escalafonDe.set(ced.valor, f['ABRE_ESC']);
  }
  // Los datos personales salen del período más reciente de cada persona.
  const ordenados = [...sub].sort((a, b) => String(normalizarFecha(b['FEC_INGRE'])).localeCompare(String(normalizarFecha(a['FEC_INGRE']))));
  // Personas con algún período activo en el Access: no pueden estar fallecidas.
  const activasAccess = new Set(sub.filter((f) => Number(f['ESTA']) === 0)
    .map((f) => normalizarCedula(f['CI'], f['CED_PERS'])?.valor).filter(Boolean));
  const ultimoPeriodoVisto = new Set<string>();
  for (const f of ordenados) {
    const origen = `EFECTIVOSSUB ID ${f['ID']}`;
    const ced = normalizarCedula(f['CI'], f['CED_PERS']);
    const nombreTxt = [f['APELLIDO 1'], f['APELLIDO 2'], f['NOMBRE 1'], f['NOMBRE 2']].map(texto).filter(Boolean).join(' ');
    if (!ced || !ced.verificadorValido) {
      incidencia({ nivel: 'error', origen, cedula: ced?.valor, nombre: nombreTxt, motivo: 'cédula inválida (dígito verificador o largo): no se importa' });
      contar('períodos de subalternos con error');
      continue;
    }
    const ap1 = texto(f['APELLIDO 1']);
    const no1 = texto(f['NOMBRE 1']);
    // Fallecimiento: la baja por fallecimiento del período más reciente, si no tiene uno activo
    // (ni en el Access ni en la base). La fecha de esa baja es la del fallecimiento.
    const esUltimo = !ultimoPeriodoVisto.has(ced.valor);
    ultimoPeriodoVisto.add(ced.valor);
    const motivoFila = motivoBaja(f['MOTIVO']);
    const fallecio = esUltimo && Number(f['ESTA']) !== 0 && motivoFila?.tipo === 'motivo' && motivoFila.codigo === 'FALLECIMIENTO'
      && !activasAccess.has(ced.valor) && !activaDb.has(refPersona(ced.valor));
    if (fallecio) contar('fechas de fallecimiento a cargar');
    registrarPersona(ced, ap1 && no1 ? {
      primer_apellido: ap1, segundo_apellido: texto(f['APELLIDO 2']), primer_nombre: no1, segundo_nombre: texto(f['NOMBRE 2']),
    } : null, {
      fecha_nacimiento: normalizarFecha(f['FEC_NAC']),
      genero: ['M', 'F'].includes(String(f['SEXO'])) ? f['SEXO'] : null,
      telefono: texto(f['TELEFONO'])?.slice(0, 30) ?? null,
      direccion: texto(f['DOMICILIO'])?.slice(0, 200) ?? null,
      codigo_postal: codigoPostal(f['CODIGO POSTAL']),
      departamento: texto(f['DEPARTAMENTO']),
      localidad: texto(f['LOCALIDAD']),
      lugar_nacimiento: departamentoNacimiento(f['DEPT_NAC']),
      fecha_fallecimiento: fallecio ? normalizarFecha(f['FECHABAJA']) : null,
    }, origen);

    // Nivel educativo (legajo, tabla nuestra): el del período más reciente que lo tenga.
    const nivelTxt = texto(f['NIVEL EDUCATIVO']);
    const personaLegajo = refPersona(ced.valor);
    if (nivelTxt && !conLegajo.has(personaLegajo) && (personasDb.has(ced.valor) || plan.personasNuevas.has(ced.valor))) {
      const nivel = nivelEducativo(nivelTxt);
      if (!nivel) {
        incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt, motivo: `nivel educativo "${nivelTxt}" no reconocido: no se carga` });
      } else if (legajosDb.get(personaLegajo) == null) {
        conLegajo.add(personaLegajo);
        plan.legajos.push({ persona: personaLegajo, nivel, actualizar: legajosDb.has(personaLegajo) });
        contar('niveles educativos a cargar');
      } else {
        conLegajo.add(personaLegajo);
      }
    }

    // Cursos aprobados (tabla nuestra): las reglas de ascenso piden varios. Salen de los cursos de
    // pasaje de grado, del nivel de pericia (7 y 9), de las especialidades y de CURSOS ETA.
    if (personasDb.has(ced.valor) || plan.personasNuevas.has(ced.valor)) {
      const aprobados: Array<{ curso: CursoCatalogo; acta: string | null; fecha?: string | null; detalle: string }> = [];
      for (const [columna, curso] of Object.entries(CURSOS_PASAJE)) {
        const cursoTxt = texto(f[columna]);
        if (!cursoTxt || cursoTxt === '0' || cursosVistos.has(`${personaLegajo}|${curso.nombre}`)) continue;
        const aprobado = cursoAprobado(cursoTxt);
        if (aprobado) aprobados.push({ curso, acta: aprobado.acta, detalle: `${columna} = "${cursoTxt}"` });
        else {
          incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt,
            motivo: `${columna} = "${cursoTxt}" no dice que aprobó el curso: no se carga` });
        }
      }
      for (const n of cursosPorNivel(f['NIVEL_PER'])) {
        // El acta de nivel 7 es del curso de instructores; la del 9 no tiene columna.
        aprobados.push({ curso: n.curso, acta: n.nivel === 7 ? actaNivel(f['ACTA DE NIVEL 7']) : null,
          detalle: `NIVEL_PER = ${normalizarEntero(f['NIVEL_PER'])}${n.nivel === 7 && actaNivel(f['ACTA DE NIVEL 7'])
            ? `, ACTA DE NIVEL 7 = "${texto(f['ACTA DE NIVEL 7'])}"` : ''}. Sale del nivel de pericia: aprobó este curso `
            + 'o presentó el certificado de uno equivalente.' });
      }
      // La especialidad principal trae acta y fecha (a veces el acta está en la columna de fecha).
      for (const columna of ['ABRE_ESP', 'ESPEC2', 'CURSOS ETA']) {
        const espTxt = texto(f[columna]);
        const r = cursosDeEspecialidad(espTxt);
        if (!r) continue;
        if (!r.cursos.length && !r.reconocido) {
          incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt,
            motivo: `${columna} = "${espTxt}" no se reconoce como especialidad o curso: no se carga` });
        }
        const principal = columna === 'ABRE_ESP';
        const fechaTxt = principal ? texto(f['FECHA_ESP']) : null;
        const actaTxt = principal ? texto(f['ACTA_ESP']) ?? (/^ACTA\b/i.test(fechaTxt ?? '') ? fechaTxt : null) : null;
        for (const curso of r.cursos) {
          aprobados.push({ curso, acta: actaTxt && actaTxt !== '0' ? actaTxt.slice(0, 50) : null,
            fecha: principal ? normalizarFecha(f['FECHA_ESP']) : null,
            detalle: `${columna} = "${espTxt}"${actaTxt ? `, ACTA_ESP = "${actaTxt}"` : ''}${fechaTxt ? `, FECHA_ESP = "${fechaTxt}"` : ''}` });
        }
      }
      for (const a of aprobados) {
        const k = `${personaLegajo}|${a.curso.nombre}`;
        if (cursosVistos.has(k)) continue;
        cursosVistos.add(k);
        if (cursosDb.has(k)) {
          contar('cursos aprobados ya cargados (se saltean)');
          continue;
        }
        plan.cursos.push({
          persona: personaLegajo, curso: a.curso.nombre, institucion: a.curso.institucion, numeroOrden: a.acta,
          fecha: a.fecha ?? null,
          observacion: `Importado de ${bases.find((b) => b.tipo === 'subalternos')!.archivo} (${origen}): ${a.detalle}`,
        });
        contar(a.curso.nombre.startsWith('Especialidad:') ? 'cursos a cargar: especialidades' : `cursos a cargar: ${a.curso.nombre}`);
      }
    }

    const grado = cat.grado(f['ABRE_GRA']);
    const rein = clave(f['ABRE_ESC']) === 'REIN';
    const escalafon = rein
      ? cat.escalafon(escalafonDe.get(ced.valor) ?? null, grado?.codigo)
      : cat.escalafon(f['ABRE_ESC'], grado?.codigo);
    const unidad = cat.unidad(f['ABREV_DES']);
    const inicio = normalizarFecha(f['FEC_INGRE']);
    const activo = Number(f['ESTA']) === 0;
    const fin = activo ? null : normalizarFecha(f['FECHABAJA']);
    const problemas = [
      !grado && `grado "${texto(f['ABRE_GRA']) ?? ''}" no reconocido`,
      !escalafon && `escalafón "${texto(f['ABRE_ESC']) ?? ''}" no reconocido`,
      'error' in unidad && unidad.error,
      !inicio && 'sin fecha de ingreso válida',
    ].filter(Boolean) as string[];
    if (problemas.length) {
      incidencia({ nivel: 'error', origen, cedula: ced.valor, nombre: nombreTxt, motivo: problemas.join('; ') });
      contar('períodos de subalternos con error');
      continue;
    }
    if (escalafon!.inferido && texto(f['ABRE_ESC']) === null && escalafon!.codigo === 'AT') {
      incidencia({ nivel: 'aviso', origen, cedula: ced.valor, motivo: 'sin escalafón: se infiere A.T. por el grado' });
    }
    if (!activo && !fin) incidencia({ nivel: 'aviso', origen, cedula: ced.valor, motivo: 'dado de baja sin fecha de baja válida' });

    // FEC_GRA es la fecha en que llegó al grado. Si es posterior al ingreso, llegó por ascenso. Al
    // primer grado de una escala (At. 2.ª) no se asciende: se llega egresando de la ETA o por mutación.
    const fechaGrado = normalizarFecha(f['FEC_GRA']);
    const anterior = gradoAnteriorSubalterno(grado!.codigo);
    if (fechaGrado && anterior && fechaGrado > inicio! && (!fin || fechaGrado <= fin)) {
      agregarAscenso({ ced, codigo: grado!.codigo, anterior, fecha: fechaGrado, origen, nombreTxt,
        observaciones: `Importado de ${bases.find((b) => b.tipo === 'subalternos')!.archivo} (${origen}).` });
    }

    // Servicio anterior declarado en el período: en otra fuerza suma años de servicio; en la FAU
    // es un período propio que no siempre tiene fila, y queda en observaciones.
    const ingresoAnterior = normalizarFecha(f['FECHA INGRESO ANTERIOR']);
    const bajaAnterior = normalizarFecha(f['FECHA BAJA']);
    const fuerza = texto(f['FUERZA 1']);
    const aniosOtraFuerza = fuerza && !esLaFau(fuerza) ? aniosEntre(ingresoAnterior, bajaAnterior) : null;
    if (aniosOtraFuerza && activo) {
      // En un período activo cambia la elegibilidad y podría cambiar lo que liquida: no se carga.
      incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt,
        motivo: `servicio en otra fuerza ("${aniosOtraFuerza} años"): no se carga en un período activo (acordar con liquidación)` });
    }

    // Motivo de baja: al catálogo, en el período y en su retiro. Ascender a Alférez no es un retiro.
    const motivoLeido = activo ? null : motivoBaja(f['MOTIVO']);
    const conducta = activo ? null : conductaDeMotivo(f['MOTIVO']);
    let motivoRef: Ref | null = null;
    if (motivoLeido?.tipo === 'motivo') {
      motivoRef = refMotivo(motivoLeido.codigo);
      if (!motivoRef) {
        incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt,
          motivo: `motivo de baja ${motivoLeido.codigo} no está en la base (correr con --crear-catalogos): no se carga el retiro` });
      }
    } else if (motivoLeido?.tipo === 'desconocido') {
      incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt,
        motivo: `motivo de baja "${texto(f['MOTIVO'])}" no se reconoce: no se carga el retiro (queda en observaciones)` });
    }

    const situacion = cat.esCadete(grado!.codigo) ? 'SIT12' : rein ? 'SIT17' : escalafon!.codigo === 'RVA' ? 'SIT08' : 'SIT07';
    const pt = String(texto(f['ABRE_PT']) ?? '').toUpperCase();
    const relacion = agregarRelacion({
      ced, activo, origen, nombreTxt,
      grado: grado!.ref, escalafon: escalafon!.ref, unidad: (unidad as { ref: Ref }).ref,
      subUnidad: (unidad as { subUnidad?: Ref }).subUnidad ?? null,
      campos: {
        situacion_id: cat.situacion(situacion), fecha_inicio: inicio, fecha_fin: fin,
        prima_tecnica: ['A', 'B', 'C'].includes(pt) ? pt : 'VACIO', tipo_funcionario: 'subalterno',
        // Fecha en que llegó al grado de este período: liquidación calcula la permanencia desde acá.
        fecha_ultimo_ascenso: normalizarFecha(f['FEC_GRA']),
        ...(aniosOtraFuerza && !activo ? { anios_servicio_anterior: aniosOtraFuerza } : {}),
        ...(motivoRef ? { motivo_baja_id: motivoRef } : {}),
        // Conducta con la que se fue (del final del motivo): solo en períodos de baja.
        ...(conducta ? { conducta } : {}),
        // Texto libre del Access que no tiene un campo propio: queda a la vista en observaciones.
        // El motivo de baja también va como texto: el catálogo no dice todo (actas, conducta).
        observaciones: observaciones(`Importado de ${bases.find((b) => b.tipo === 'subalternos')!.archivo} (${origen})`, {
          'Motivo de baja': f['MOTIVO'], 'Comisiones': f['COMISIONES'], 'Duración de la comisión': f['DURACION DE LA COMISION'],
          'Comisiones del servicio': f['COMISIONES DEL SERVICIO'],
          'Destinos anteriores': f['DESTINO ANTERIOR'], 'Años anteriores': f['AÑOS ANTERIORES'],
          'Licencia sin goce de sueldo': f['LICENCIA SIN GOCE DE SUELDO'], 'Período desde-hasta': f['PERIODO DESDE HASTA'],
          'Servicio anterior': fuerza || ingresoAnterior
            ? `${fuerza ?? 'sin fuerza'}, de ${ingresoAnterior ?? '?'} a ${bajaAnterior ?? '?'}` : null,
          'Segunda fuerza anterior': f['FUERZA 2'], 'Fecha de reingreso': f['FECHA REINGRESO'],
          'Fecha de baja anterior': normalizarFecha(f['FECHA BAJA ANTERIOR']),
        }),
      },
      destino: { fechaInicio: inicio, fechaFin: fin, numeroOrden: null, posicion: null,
        observaciones: observaciones('', { 'Sub-unidad': f['SUB-UNIDAD'] }) },
    });

    // Un período de baja que ya estaba en la base recibe la conducta si no la tiene.
    const previo = relacion ? relacionPorClave.get(`${refPersona(ced.valor)}|${inicio}|${grado!.ref}`) : undefined;
    if (conducta && relacion && previo?.id === relacion && previo.estado !== 'activo' && !previo.conducta && previo.fin === fin) {
      plan.conductasRelacion.push({ relacionId: relacion, conducta });
      contar('conductas completadas en períodos existentes');
    }

    if (relacion && motivoRef && motivoLeido?.tipo === 'motivo') {
      // Un período que ya estaba en la base (de una corrida anterior) recibe el motivo si no lo tiene.
      const existente = relacionPorClave.get(`${refPersona(ced.valor)}|${inicio}|${grado!.ref}`);
      if (existente?.id === relacion && existente.estado !== 'activo' && !existente.motivo && existente.fin === fin) {
        plan.motivosRelacion.push({ relacionId: relacion, motivo: motivoRef });
        contar('motivos de baja completados en períodos existentes');
      }
      if (!fin) {
        incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt,
          motivo: 'baja sin fecha válida: no se carga el retiro' });
      } else if (existente?.id === relacion && existente.fin !== fin) {
        // Dos filas del Access con el mismo ingreso y grado pero otra baja: el período es el de la otra.
        incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt,
          motivo: 'el período ya cargado tiene otra fecha de baja: no se carga el retiro' });
      } else if (!retirosDb.has(relacion)) {
        retirosDb.add(relacion);
        plan.retiros.push({
          persona: refPersona(ced.valor), relacion, fecha: fin, motivoBaja: motivoRef, motivo: texto(f['MOTIVO'])!,
          numeroOrden: motivoLeido.numeroOrden?.slice(0, 50) ?? null, boletin: motivoLeido.boletin?.slice(0, 50) ?? null,
          observaciones: `Importado de ${bases.find((b) => b.tipo === 'subalternos')!.archivo} (${origen}).`,
        });
        contar('retiros a crear');
      }
    }
  }

  // Oficiales: una fila por oficial en actividad ────────────────────────────
  const ofi = bases.find((b) => b.tipo === 'oficiales');
  const desnum = new Map((ofi?.tablas.get('DESNUM') ?? []).map((d) => [Number(d['Des Num']), d['DES']]));
  for (const f of ofi?.tablas.get('xescala') ?? []) {
    const origen = `xescala ID ${f['ID']}`;
    const ced = normalizarCedula(f['Cedula Identidad']);
    const nombreTxt = texto(f['Nombre y Apellido']) ?? '';
    if (!ced || !ced.verificadorValido) {
      incidencia({ nivel: 'error', origen, cedula: ced?.valor, nombre: nombreTxt, motivo: 'cédula inválida: no se importa' });
      contar('oficiales con error');
      continue;
    }
    registrarPersona(ced, partesNombre(f['Nombre y Apellido']) ?? nombreExcel.get(ced.valor) ?? null, {
      fecha_nacimiento: normalizarFecha(f['Fecha Nacimiento']),
      genero: ['M', 'F'].includes(String(f['SEXO'])) ? f['SEXO'] : null,
      telefono: texto(f['Teléfono'])?.slice(0, 30) ?? null,
      direccion: texto(f['Dirección'])?.slice(0, 200) ?? null,
      codigo_postal: codigoPostal(f['CODIGO POSTAL']),
      email: texto(f['E-mail'])?.slice(0, 150) ?? null,
      lugar_nacimiento: texto(f['Lugar Nac'])?.slice(0, 200) ?? null,
      seccional: texto(f['Secc_Jud_'])?.slice(0, 100) ?? null,
    }, origen);

    // Año en que llegó a cada grado. El Access no trae el día: va el 1/1 y la observación lo aclara.
    ANIOS_GRADO_OFICIAL.forEach(([columna, codigo], i) => {
      const anio = anioAscenso(f[columna]);
      if (i === 0 || anio === null) return;
      agregarAscenso({ ced, codigo, anterior: ANIOS_GRADO_OFICIAL[i - 1][1], fecha: `${anio}-01-01`, origen, nombreTxt,
        observaciones: `Importado de ${ofi!.archivo} (${origen}). El Access trae solo el año (${anio}): el día y el mes no son reales.` });
    });

    const grado = cat.grado(f['GRADO']);
    const escalafon = cat.escalafon(f['Escalafon'], grado?.codigo);
    const destinoTxt = clave(f['Destino']);
    let situacion = 'SIT01';
    let unidad: ReturnType<Catalogos['unidad']>;
    if (destinoTxt.startsWith('RETIROENTRAMITE')) {
      unidad = cat.unidad(desnum.get(Number(f['Numero Destino'])));
    } else if (destinoTxt.startsWith('TRAMITENODISPONIBLE')) {
      situacion = 'SIT04';
      unidad = cat.unidad('C.G.F.A.');
    } else {
      unidad = cat.unidad(f['Destino']);
      if ('error' in unidad) unidad = cat.unidad(desnum.get(Number(f['Numero Destino'])));
    }
    const inicio = normalizarFecha(f['Fecha de Ingreso']);
    const problemas = [
      !grado && `grado "${texto(f['GRADO']) ?? ''}" no reconocido`,
      !escalafon && `escalafón "${texto(f['Escalafon']) ?? ''}" no reconocido`,
      'error' in unidad && unidad.error,
      !inicio && 'sin fecha de ingreso válida',
    ].filter(Boolean) as string[];
    if (problemas.length) {
      incidencia({ nivel: 'error', origen, cedula: ced.valor, nombre: nombreTxt, motivo: problemas.join('; ') });
      contar('oficiales con error');
      continue;
    }
    agregarRelacion({
      ced, activo: true, origen, nombreTxt,
      grado: grado!.ref, escalafon: escalafon!.ref, unidad: (unidad as { ref: Ref }).ref, subUnidad: null,
      campos: {
        situacion_id: cat.situacion(situacion), fecha_inicio: inicio, fecha_fin: null, prima_tecnica: 'VACIO',
        tipo_funcionario: 'oficial', derecha: normalizarEntero(f['DERECHA']), numor: normalizarEntero(f['Numor']),
        observaciones: observaciones(`Importado de ${ofi!.archivo} (${origen})`, {
          'Destinos anteriores': f['Destino Anterior'], 'Comisiones': f['Comisiones'],
          'Comisión': f['Nombre de la Comisión'], 'Fechas de la comisión': f['Fechas de la Comisión'],
        }),
      },
      destino: {
        fechaInicio: normalizarFecha(f['Fecha Destino']), fechaFin: null,
        numeroOrden: texto(f['Numero OCGFA Destino'])?.slice(0, 50) ?? null,
        posicion: texto(f['Cargo'])?.slice(0, 200) ?? null,
        observaciones: observaciones('', {
          'Fecha de la orden': normalizarFecha(f['Fecha OCGFA Destino']),
          'Resolución': f['Numero Resolucion Destino'], 'Fecha de resolución': normalizarFecha(f['Fecha Resolucion Destino']),
          'Boletín': f['No_BolDES'],
        }),
      },
    });
  }

  // Familia de los oficiales (relaciones_familiares, tabla nuestra) ─────────
  // Como el alta de la aplicación: un familiar civil se crea con es_civil y queda vinculado al
  // militar; si la cédula ya es de alguien en la base (o en estos archivos), solo se vincula.
  const estaCargada = (c: Cedula) => personasDb.has(c.valor) || plan.personasNuevas.has(c.valor);
  const vincular = (persona: Ref, familiar: Ref, tipo: string, origen: string) => {
    if (persona === familiar || familiaresDb.has(`${persona}|${familiar}`)) {
      contar('vínculos familiares ya cargados (se saltean)');
      return;
    }
    familiaresDb.add(`${persona}|${familiar}`);
    familiaresDb.add(`${familiar}|${persona}`);
    plan.familiares.push({ persona, familiar, tipo, observaciones: `Importado de ${ofi!.archivo} (${origen}).` });
    contar('vínculos familiares a crear');
  };
  for (const f of ofi?.tablas.get('xescala') ?? []) {
    const ced = normalizarCedula(f['Cedula Identidad']);
    if (!ced?.verificadorValido || !estaCargada(ced)) continue;
    const origen = `xescala ID ${f['ID']}`;
    const nombreTxt = texto(f['Nombre y Apellido']) ?? '';
    const oficial = refPersona(ced.valor);

    // Esposa: solo si ya está cargada. El nombre viene sin coma y no se puede separar con seguridad
    // en nombres y apellidos; una persona mal cargada no se corrige sola (no se pisan datos).
    const ciEsposa = texto(f['C-I- Esposa']) ? normalizarCedula(f['C-I- Esposa']) : null;
    if (ciEsposa && !ciEsposa.verificadorValido) {
      incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt, motivo: 'cédula de la esposa inválida: no se vincula' });
    } else if (ciEsposa && estaCargada(ciEsposa)) {
      vincular(oficial, refPersona(ciEsposa.valor), 'Cónyuge', origen);
      // Su fecha de nacimiento, como el resto de los datos personales: solo si está vacía.
      const nacEsposa = normalizarFecha(f['Fecha de Nac Esposa']);
      if (nacEsposa) registrarPersona(ciEsposa, null, { fecha_nacimiento: nacEsposa }, origen);
    } else if (ciEsposa) {
      contar('esposas que no están en la base (no se crean)');
    }

    // Hijos: los que ya están se vinculan; el resto se crea como civil con el primer apellido del
    // padre (el Access trae solo el nombre de pila). Si el oficial es mujer, ese apellido no se sabe.
    const hijos = hijosDeFila(f['Nombre de los Hijos'], f['Cédula Hijos'], f['Fecha Nac Hijos']);
    if (!hijos) continue;
    if ('error' in hijos) {
      incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt, motivo: `hijos: ${hijos.error}` });
      continue;
    }
    const apellido = personasDb.get(ced.valor)?.primer_apellido ?? (plan.personasNuevas.get(ced.valor)?.datos.primer_apellido as string | undefined);
    for (const hijo of hijos.hijos) {
      const c = normalizarCedula(hijo.cedula);
      if (!c?.verificadorValido) {
        incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt, motivo: 'cédula de un hijo inválida: no se carga' });
        continue;
      }
      if (estaCargada(c)) {
        vincular(oficial, refPersona(c.valor), 'Hijo/a', origen);
        continue;
      }
      if (String(f['SEXO']).trim().toUpperCase() !== 'M' || !apellido) {
        incidencia({ nivel: 'aviso', origen, cedula: ced.valor, nombre: nombreTxt,
          motivo: 'hijo sin apellido (el Access trae solo el nombre y la oficial es mujer): no se crea' });
        continue;
      }
      // Si el nombre ya trae el apellido del padre, lo que sigue es el segundo apellido.
      const partes = hijo.nombre.split(/\s+/);
      const i = partes.findIndex((p) => clave(p) === clave(apellido));
      plan.personasNuevas.set(c.valor, {
        ref: `nueva:${c.valor}`, cedula: c.valor,
        datos: {
          primer_nombre: partes[0], segundo_nombre: (i > 0 ? partes.slice(1, i) : partes.slice(1)).join(' ') || null,
          primer_apellido: apellido, segundo_apellido: i > 0 ? partes.slice(i + 1).join(' ') || null : null,
          fecha_nacimiento: hijo.fecha, es_civil: true,
        },
      });
      contar('hijos civiles a crear');
      // Desde el hijo (civil), el oficial es su padre: así lo registra el alta de un civil.
      vincular(`nueva:${c.valor}`, oficial, 'Padre', origen);
    }
  }

  /**
   * Derecha y Numor del Access, solo si están libres (son únicos por escala, y por grado +
   * escalafón). Cada uno asignado deja su alta en historial_derecha_numor, como la aplicación.
   */
  function asignarOrden(r: { ced: Cedula; origen: string; nombreTxt: string; campos: Record<string, unknown> },
    grado: Ref, escalafon: Ref): { derecha: number | null; numor: number | null } {
    const derecha = r.campos.derecha as number | null;
    const numor = r.campos.numor as number | null;
    const kd = `OFICIALES|${derecha}`;
    const kn = `${grado}|${escalafon}|${numor}`;
    const libreD = derecha !== null && derecha > 0 && !derechasUsadas.has(kd);
    const libreN = numor !== null && numor > 0 && !numorsUsados.has(kn);
    const ocupadas = [derecha !== null && !libreD && 'Derecha', numor !== null && !libreN && 'Numor'].filter(Boolean);
    if (ocupadas.length) {
      incidencia({ nivel: 'aviso', origen: r.origen, cedula: r.ced.valor, nombre: r.nombreTxt,
        motivo: `${ocupadas.join(' y ')} del Access ya la tiene otra persona en la base (o no es válida): se deja vacía (cargar a mano)` });
    }
    const persona = refPersona(r.ced.valor);
    if (libreD) {
      derechasUsadas.add(kd);
      plan.historial.push({ persona, tipo: 'DERECHA', valor: derecha!, origen: r.origen });
    }
    if (libreN) {
      numorsUsados.add(kn);
      plan.historial.push({ persona, tipo: 'NUMOR', valor: numor!, origen: r.origen });
    }
    return { derecha: libreD ? derecha : null, numor: libreN ? numor : null };
  }

  /**
   * Período laboral. Devuelve la relación a la que corresponde (su id si ya estaba en la base,
   * "rel:N" si se crea en esta corrida), o undefined si no se carga.
   */
  function agregarRelacion(r: {
    ced: Cedula; activo: boolean; origen: string; nombreTxt: string;
    grado: Ref; escalafon: Ref; unidad: Ref; subUnidad: Ref | null;
    campos: Record<string, unknown>;
    destino: { fechaInicio: string | null; fechaFin: string | null; numeroOrden: string | null; posicion: string | null;
      observaciones: string };
  }): string | undefined {
    const persona = refPersona(r.ced.valor);
    if (!plan.personasNuevas.has(r.ced.valor) && !personasDb.has(r.ced.valor)) {
      incidencia({ nivel: 'error', origen: r.origen, cedula: r.ced.valor, nombre: r.nombreTxt,
        motivo: 'no se pudo crear la persona (falta nombre y apellido): no se carga su período' });
      contar('períodos sin persona');
      return;
    }
    const faltan = [r.grado, r.escalafon, r.unidad, r.subUnidad].filter((x): x is Ref => !!x && !usable(x));
    if (faltan.length) {
      incidencia({ nivel: 'error', origen: r.origen, cedula: r.ced.valor, nombre: r.nombreTxt,
        motivo: `faltan en la base: ${faltan.map((x) => x.replace(/^nuevo:/, '')).join(', ')} (correr con --crear-catalogos)` });
      contar('períodos sin catálogo');
      return;
    }
    // Un activo que ya existe pasa igual al bloque de abajo: puede tener Derecha/Numor para completar.
    if (!(r.activo && activaDb.has(persona)) && yaImportada.has(`${persona}|${r.campos.fecha_inicio}|${r.grado}`)) {
      contar('períodos ya cargados (se saltean)');
      return relacionPorClave.get(`${persona}|${r.campos.fecha_inicio}|${r.grado}`)?.id ?? undefined;
    }
    if (r.activo) {
      const existente = activaDb.get(persona);
      if (existente) {
        // Ya la liquida liquidación: no se toca. Si no coincide con el Access, se avisa.
        const difs = [existente.grado !== r.grado && 'grado', existente.unidad !== r.unidad && 'unidad'].filter(Boolean);
        if (difs.length) {
          incidencia({ nivel: 'aviso', origen: r.origen, cedula: r.ced.valor, nombre: r.nombreTxt,
            motivo: `ya tiene un período activo en la base; difiere en ${difs.join(' y ')} con el Access (no se modifica)` });
        }
        contar('activos que ya existían (no se tocan)');
        // La fecha de grado cambia la permanencia que calcula liquidación: en un activo ajeno solo se avisa.
        if (existente.id && !existente.fua && r.campos.fecha_ultimo_ascenso) {
          incidencia({ nivel: 'aviso', origen: r.origen, cedula: r.ced.valor, nombre: r.nombreTxt,
            motivo: `su período activo no tiene fecha de último ascenso; el Access dice ${r.campos.fecha_ultimo_ascenso} (no se carga: acordar con liquidación)` });
        }
        // Derecha y Numor son columnas del módulo de personal (liquidación no las usa): si la
        // relación existente no tiene ninguna de las dos, se completan con las del Access.
        if (existente.id && existente.derecha === null && existente.numor === null
          && (r.campos.derecha != null || r.campos.numor != null)) {
          const orden = asignarOrden(r, existente.grado, existente.escalafon);
          if (orden.derecha !== null || orden.numor !== null) {
            plan.derechas.push({ relacionId: existente.id, ...orden });
            contar('Derecha/Numor completados en activos existentes');
          }
        }
        return;
      }
      if (!op.crearActivos) {
        incidencia({ nivel: 'aviso', origen: r.origen, cedula: r.ced.valor, nombre: r.nombreTxt,
          motivo: 'activo en el Access y sin período activo en la base: no se crea (usar --crear-activos)' });
        contar('activos no creados');
        return;
      }
      if (!cat.tieneRemuneracion(r.grado)) {
        incidencia({ nivel: 'error', origen: r.origen, cedula: r.ced.valor, nombre: r.nombreTxt,
          motivo: 'el grado no tiene remuneración cargada: un período activo haría fallar la liquidación' });
        contar('activos no creados');
        return;
      }
      activaDb.set(persona, { id: null, persona, inicio: String(r.campos.fecha_inicio), grado: r.grado, escalafon: r.escalafon,
        unidad: r.unidad, estado: 'activo', derecha: null, numor: null });
      contar('activos a crear');
    } else {
      contar('períodos históricos a crear');
    }
    yaImportada.add(`${persona}|${r.campos.fecha_inicio}|${r.grado}`);
    if (r.campos.derecha != null || r.campos.numor != null) {
      const orden = asignarOrden(r, r.grado, r.escalafon);
      r.campos.derecha = orden.derecha;
      r.campos.numor = orden.numor;
      if (orden.derecha !== null) r.campos.escala_derecha = 'OFICIALES';
    }
    plan.relaciones.push({
      persona, origen: r.origen,
      campos: {
        ...r.campos, estado: r.activo ? 'activo' : 'inactivo', grado_id: r.grado, escalafon_id: r.escalafon,
        unidad_id: r.unidad, sub_unidad_id: r.subUnidad, regimen_id: cat.regimenLeyNueva, programa_id: cat.programa300,
      },
    });
    const ref = `rel:${plan.relaciones.length - 1}`;

    // Destino: uno por período. Solo puede haber un destino abierto por persona.
    const d = r.destino;
    const abierto = d.fechaFin === null;
    if (destinoExiste.has(`${persona}|${r.unidad}|${d.fechaInicio}`) || (abierto && (!r.activo || destinoActivo.has(persona)))) return ref;
    destinoExiste.add(`${persona}|${r.unidad}|${d.fechaInicio}`);
    if (abierto) destinoActivo.add(persona);
    plan.destinos.push({ persona, unidad: r.unidad, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, numeroOrden: d.numeroOrden,
      posicion: d.posicion, observaciones: observaciones(`Importado de ${r.origen}`, {}) + (d.observaciones ? `; ${d.observaciones}` : '') });
    contar('destinos a crear');
    return ref;
  }

  // Horas de vuelo (Excel) ───────────────────────────────────────────────────
  // Las hojas que traen cédula y nombre (2020) incluyen oficiales ya retirados, que no están en los
  // Access: con cédula y nombre se los puede crear (sin período laboral, así que liquidación no los ve).
  for (const hoja of hojas) {
    for (const f of hoja.filas) {
      const ced = texto(f.cedula) ? normalizarCedula(f.cedula) : null;
      const partes = partesNombre(f.nombre);
      if (ced?.verificadorValido && partes && !personasDb.has(ced.valor) && !plan.personasNuevas.has(ced.valor)) {
        registrarPersona(ced, partes, {}, `hoja "${hoja.titulo}" fila ${f.fila}`);
        contar('personas creadas desde el Excel de vuelo');
      }
    }
  }
  const indice = indicePorNombre(personasDb, plan.personasNuevas);
  const porId = new Map([...personasDb.values()].map((p) => [p.id, p]));
  for (const hoja of hojas) {
    if (!hoja.periodo) {
      if (hoja.filas.length) incidencia({ nivel: 'error', origen: `hoja "${hoja.titulo}"`, motivo: 'no se reconoce el período en el nombre de la hoja' });
      continue;
    }
    const vistos = new Set<string>();
    for (const f of hoja.filas) {
      const origen = `hoja "${hoja.titulo}" fila ${f.fila}`;
      const nombreTxt = texto(f.nombre) ?? '';
      const grado = cat.grado(f.grado);
      let persona: Ref | null = null;
      if (texto(f.cedula)) {
        const ced = normalizarCedula(f.cedula);
        persona = ced && (personasDb.has(ced.valor) || plan.personasNuevas.has(ced.valor)) ? refPersona(ced.valor) : null;
        if (persona && nombreTxt && !nombreCoincide(persona, nombreTxt, porId, plan.personasNuevas)) {
          incidencia({ nivel: 'error', origen, cedula: ced!.valor, nombre: nombreTxt,
            motivo: 'el nombre no coincide con la persona de esa cédula (posible cédula cruzada): no se carga' });
          contar('filas de vuelo con error');
          continue;
        }
      }
      if (!persona) {
        const r = buscarPorNombre(indice, nombreTxt, grado?.codigo);
        if (r.tipo !== 'unico') {
          incidencia({ nivel: r.tipo === 'sugerencia' ? 'aviso' : 'error', origen, nombre: nombreTxt,
            motivo: r.tipo === 'sugerencia' ? 'solo coincide por primer apellido y nombre: verificar a mano (no se carga)'
              : r.tipo === 'ambiguo' ? 'el nombre coincide con más de una persona: no se carga' : 'no se encontró a la persona: no se carga' });
          contar('filas de vuelo sin persona');
          continue;
        }
        persona = r.persona;
      }
      const k = `${hoja.periodo.anio}-${hoja.periodo.numero}|${persona}`;
      if (vistos.has(k)) {
        incidencia({ nivel: 'aviso', origen, nombre: nombreTxt, motivo: 'la persona aparece dos veces en la hoja: se toma la primera' });
        continue;
      }
      vistos.add(k);
      if (vuelosDb.has(k)) {
        contar('registros de vuelo ya cargados (se saltean)');
        continue;
      }
      const escalafon = cat.escalafon(f.escalafon, grado?.codigo);
      const horas = [f.hsAvAnio, f.hsAvTotal, f.hsObAnio, f.hsObTotal].map((h) => Math.max(0, normalizarDecimal(h) ?? 0));
      const refs = [grado?.ref, escalafon?.ref].filter((x): x is Ref => !!x);
      plan.vuelos.push({
        persona, periodo: hoja.periodo,
        campos: {
          grado_id: grado && usable(grado.ref) ? grado.ref : null,
          escalafon_id: escalafon && usable(escalafon.ref) ? escalafon.ref : null,
          tipo_funcionario: grado ? (OFICIALES.has(grado.codigo) ? 'oficial' : 'subalterno') : null,
          unidad_vuelo_id: cat.unidadVuelo(f.unidadVuelo),
          aeronaves: texto(f.aeronaves),
          hs_av_anio_militar: horas[0], hs_av_total: horas[1], hs_ob_anio_militar: horas[2], hs_ob_total: horas[3],
          // Hojas sin horas cargadas (período en curso) quedan como "generadas y nunca editadas".
          editado_en: horas.some((h) => h > 0) ? new Date() : null,
        },
      });
      if (refs.some((x) => !usable(x))) incidencia({ nivel: 'aviso', origen, nombre: nombreTxt, motivo: 'grado o escalafón sin catálogo: el registro queda sin ese dato' });
      contar('registros de vuelo a crear');
    }
  }

  // Horasvlo: la última planilla de horas de cada oficial (sobre todo 2002-2005), con totales
  // acumulados. Completa la historia de vuelo anterior al Excel. ─────────────────
  const enPlan = new Set(plan.vuelos.map((v) => `${v.periodo.anio}-${v.periodo.numero}|${v.persona}`));
  (ofi?.tablas.get('Horasvlo') ?? []).forEach((f, i) => {
    const origen = `Horasvlo fila ${i + 1}`;
    const horas = [f['Pil Año Mil'], f['HPIL'], f['Obs Año Mil'], f['HOBS']].map((h) => Math.max(0, normalizarDecimal(h) ?? 0));
    const sinUnidad = !texto(f['ASIG_VOL']) || clave(f['ASIG_VOL']) === 'NOVUELA';
    if (horas.every((h) => h === 0) && sinUnidad) return contar('filas de Horasvlo sin horas (se ignoran)');
    const ced = normalizarCedula(f['CEDIN']);
    if (!ced || !(personasDb.has(ced.valor) || plan.personasNuevas.has(ced.valor))) {
      incidencia({ nivel: 'error', origen, cedula: ced?.valor, motivo: 'la persona no está en la base ni en los Access: no se cargan sus horas' });
      return contar('filas de Horasvlo sin persona');
    }
    const m = /^\s*([1-4])\s*\/\s*(\d{4})\s*$/.exec(String(f['PER'] ?? ''));
    if (!m) {
      incidencia({ nivel: 'error', origen, cedula: ced.valor, motivo: `período "${texto(f['PER']) ?? ''}" no reconocido (se espera trimestre/año): no se cargan sus horas` });
      return contar('filas de Horasvlo con error');
    }
    const periodo = { anio: Number(m[2]), numero: Number(m[1]) };
    const persona = refPersona(ced.valor);
    const k = `${periodo.anio}-${periodo.numero}|${persona}`;
    if (vuelosDb.has(k) || enPlan.has(k)) return contar('registros de vuelo ya cargados (se saltean)');
    enPlan.add(k);
    plan.vuelos.push({
      persona, periodo,
      campos: {
        grado_id: null, escalafon_id: null, tipo_funcionario: 'oficial',
        unidad_vuelo_id: sinUnidad ? null : cat.unidadVuelo(f['ASIG_VOL']), aeronaves: null,
        hs_av_anio_militar: horas[0], hs_av_total: horas[1], hs_ob_anio_militar: horas[2], hs_ob_total: horas[3],
        editado_en: horas.some((h) => h > 0) ? new Date() : null,
      },
    });
    contar('registros de vuelo a crear (Horasvlo)');
  });

  // xescala: la planilla de horas de un período por oficial ("1er periodo 2019"). Desde 2020
  // repite el Excel, que manda aunque se importe después: solo se toman los años anteriores. ──
  for (const f of ofi?.tablas.get('xescala') ?? []) {
    const m = /([1-4])\s*(?:er|do|ro|to)?\s*per\w*\s*(\d{4})/i.exec(String(f['Periodo de Vuelo'] ?? ''));
    const ced = normalizarCedula(f['Cedula Identidad']);
    if (!m || Number(m[2]) >= 2020 || !ced?.verificadorValido || !(personasDb.has(ced.valor) || plan.personasNuevas.has(ced.valor))) continue;
    const periodo = { anio: Number(m[2]), numero: Number(m[1]) };
    const persona = refPersona(ced.valor);
    const k = `${periodo.anio}-${periodo.numero}|${persona}`;
    if (vuelosDb.has(k) || enPlan.has(k)) continue;
    enPlan.add(k);
    const grado = cat.grado(f['GRADO']);
    const horas = [f['Hs Av Año Militar'], f['Hs Av Total'], f['Hs  Ob Año Militar'], f['Hs Ob Total']]
      .map((h) => Math.max(0, normalizarDecimal(h) ?? 0));
    plan.vuelos.push({
      persona, periodo,
      campos: {
        grado_id: grado && usable(grado.ref) ? grado.ref : null, escalafon_id: null, tipo_funcionario: 'oficial',
        unidad_vuelo_id: cat.unidadVuelo(f['Unidad de Vuelo']), aeronaves: texto(f['Aviones']),
        hs_av_anio_militar: horas[0], hs_av_total: horas[1], hs_ob_anio_militar: horas[2], hs_ob_total: horas[3],
        editado_en: horas.some((h) => h > 0) ? new Date() : null,
      },
    });
    contar('registros de vuelo a crear (xescala)');
  }

  // Misiones y salidas al exterior (tablas nuestras) ──────────────────────────
  // Misma misión = mismo texto, país y fechas: las filas de cada persona se juntan en una sola.
  const { misiones, vacias } = leerMisiones(ofi);
  if (vacias) contar('filas de misiones vacías (se ignoran)', vacias);
  for (const m of misiones) {
    const ced = normalizarCedula(m.cedula);
    const existe = ced && (personasDb.has(ced.valor) || plan.personasNuevas.has(ced.valor));
    if (!existe) {
      incidencia({ nivel: 'error', origen: m.origen, cedula: ced?.valor,
        motivo: 'la persona no está en la base ni en los Access (sin nombre para crearla): no se asigna la misión' });
      contar('participaciones en misiones sin persona');
      continue;
    }
    const persona = refPersona(ced!.valor);
    let mision = plan.misiones.get(m.clave);
    if (!mision) {
      mision = { existenteId: misionesDb.get(m.clave) ?? null, campos: m.campos, participantes: new Set() };
      plan.misiones.set(m.clave, mision);
    }
    if (mision.existenteId && participantesDb.has(`${persona}|${mision.existenteId}`)) {
      contar('participaciones en misiones ya cargadas (se saltean)');
      continue;
    }
    if (!mision.participantes.has(persona)) {
      mision.participantes.add(persona);
      contar('participaciones en misiones a crear');
    }
  }
  contar('misiones nuevas a crear', [...plan.misiones.values()].filter((m) => !m.existenteId && m.participantes.size).length);
  return plan;
}

/** "Importado de …; Motivo de baja: …; Comisiones: …", solo con los datos que vienen. */
/** Código postal uruguayo: 5 dígitos (los de menos son códigos viejos o errores). */
function codigoPostal(v: unknown): string | null {
  const n = normalizarEntero(v);
  return n !== null && n > 9999 && n <= 99999 ? String(n) : null;
}

function observaciones(base: string, extra: Record<string, unknown>): string {
  return [base, ...Object.entries(extra).map(([k, v]) => (texto(v) ? `${k}: ${texto(v)}` : null))]
    .filter(Boolean).join('; ');
}

// ── Unión por nombre ─────────────────────────────────────────────────────────

type Indice = Map<string, Set<Ref>>;

function claves(apellidos: string[], nombres: string[]): Array<[string, string]> {
  if (!apellidos.length) return [];
  const pn = nombres[0] ?? '';
  return [
    ['completo', `${apellidos.join(' ')}|${nombres.join(' ')}`],
    ['apellidos+nombre', `${apellidos.join(' ')}|${pn}`],
    ['apellidos+inicial', `${apellidos.join(' ')}|${pn.slice(0, 1)}`],
    ['1er apellido+nombre', `${apellidos[0]}|${pn}`],
  ];
}

function indicePorNombre(db: Map<string, PersonaDb>, nuevas: Map<string, PersonaNueva>): Indice {
  const indice: Indice = new Map();
  const agregar = (ref: Ref, p: { primer_apellido: unknown; segundo_apellido: unknown; primer_nombre: unknown; segundo_nombre: unknown }) => {
    const ap = palabras(`${p.primer_apellido ?? ''} ${p.segundo_apellido ?? ''}`);
    const no = palabras(`${p.primer_nombre ?? ''} ${p.segundo_nombre ?? ''}`);
    for (const [tipo, k] of claves(ap, no)) {
      const key = `${tipo}|${k}`;
      if (!indice.has(key)) indice.set(key, new Set());
      indice.get(key)!.add(ref);
    }
  };
  for (const p of db.values()) agregar(p.id, p);
  for (const p of nuevas.values()) agregar(p.ref, p.datos as never);
  return indice;
}

/**
 * Medido sobre las copias anonimizadas: nombre completo, apellidos + nombre y apellidos +
 * inicial no dieron errores; por primer apellido y nombre, 18% de errores, así que solo se
 * sugiere. Con más de un candidato no se elige (no hay un dato confiable del grado de cada
 * persona en cada período para desempatar).
 */
function buscarPorNombre(indice: Indice, nombre: string, _grado?: string):
  { tipo: 'unico'; persona: Ref } | { tipo: 'ambiguo' | 'sugerencia' | 'ninguno' } {
  let ambiguo = false;
  let sugerencia = false;
  for (const [apellidos, nombres] of separarNombre(nombre)) {
    for (const [tipo, k] of claves(apellidos, nombres)) {
      const c = indice.get(`${tipo}|${k}`);
      if (!c || !c.size) continue;
      if (c.size > 1) {
        ambiguo = true;
        continue;
      }
      if (tipo === '1er apellido+nombre') {
        sugerencia = true;
        continue;
      }
      return { tipo: 'unico', persona: [...c][0] };
    }
  }
  return { tipo: ambiguo ? 'ambiguo' : sugerencia ? 'sugerencia' : 'ninguno' };
}

/** Con cédula y nombre en la misma fila: el primer apellido tiene que coincidir. */
function nombreCoincide(persona: Ref, nombre: string, porId: Map<string, PersonaDb>, nuevas: Map<string, PersonaNueva>): boolean {
  const p = porId.get(persona) ?? nuevas.get(persona.replace(/^nueva:/, ''))?.datos;
  if (!p) return true;
  const apellidos = new Set(palabras(`${p['primer_apellido'] ?? ''} ${p['segundo_apellido'] ?? ''}`));
  const primero = separarNombre(nombre)[0]?.[0]?.[0];
  return !primero || apellidos.has(primero);
}

export type { Fila };

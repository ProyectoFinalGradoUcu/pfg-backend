import { configEntidad } from './auditoria-nombres';
import { calcularCambios, type CambioAuditoria } from './auditoria-cambios';

export interface DatosResumen {
  accion: string;
  entidad: string | null;
  entidadNombre: string | null;
  detalle: unknown;
  nombres?: Record<string, string>;
}

const VERBOS: Record<string, string> = {
  CREAR: 'Creó',
  ACTUALIZAR: 'Modificó',
  ELIMINAR: 'Eliminó',
  ASIGNAR: 'Asignó',
  DESASIGNAR: 'Quitó',
  DESCARGAR: 'Descargó',
  'ascenso.anular': 'Anuló',
  'orden_ascenso.anular': 'Anuló',
  'retiro.anular': 'Anuló',
  'reincorporacion.anular': 'Anuló',
  'regla_ascenso.desactivar': 'Desactivó',
  'regla_ascenso.restaurar': 'Restauró',
  'relacion_laboral.cambio_unidad': 'Cambió de base',
};

const FIJAS: Record<string, string> = {
  LOGIN: 'Inició sesión',
  LOGOUT: 'Cerró sesión',
  CAMBIAR_PASSWORD: 'Cambió su contraseña',
  'derecha.reordenar': 'Reordenó la derecha',
  'derecha.cambios': 'Aplicó cambios en la derecha',
  'numor.reordenar': 'Reordenó el numor',
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;

// "la persona Sgto. Juan Pérez", "el retiro de Cbo. Ana Gómez", "una misión" si no hay nombre.
export function fraseEntidad(entidad: string, nombre: string | null, indefinido = false): string {
  const cfg = configEntidad(entidad);
  const sustantivo = entidad.charAt(0).toLowerCase() + entidad.slice(1);
  if (!nombre) {
    const art = indefinido ? (cfg.articulo === 'la' ? 'una' : 'un') : cfg.articulo;
    return `${art} ${sustantivo}`;
  }
  return `${cfg.articulo} ${sustantivo}${cfg.dePersona ? ' de' : ''} ${nombre}`;
}

const listaDenominaciones = (v: unknown) =>
  (Array.isArray(v) ? v : []).map((u) => texto(obj(u).denominacion)).filter(Boolean).join(', ');

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const conMotivo = (frase: string, motivo: unknown) => {
  const m = texto(motivo);
  return m ? `${frase}. Motivo: ${m}` : frase;
};
// "Juan, Ana y Pedro" o los primeros y cuántos más
function enumerar(nombres: string[], max = 3): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  if (nombres.length > max) return `${nombres.slice(0, max).join(', ')} y ${nombres.length - max} más`;
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

// Arma la frase del evento con los datos que haya
export function armarResumen(d: DatosResumen): string | null {
  const detalle = obj(d.detalle);
  const params = obj(detalle.params);
  const bodyCrudo = obj(detalle.body);
  const body = Object.keys(obj(bodyCrudo.service_request)).length ? obj(bodyCrudo.service_request) : bodyCrudo;
  const resultado = obj(detalle.resultado);
  const nombres = d.nombres ?? {};
  const nombreParam = (clave: string) => {
    const v = params[clave];
    return typeof v === 'string' || typeof v === 'number' ? nombres[`${clave}:${v}`] ?? null : null;
  };
  const entidad = d.entidad;
  const nombre = d.entidadNombre;
  const afectados = typeof resultado.afectados === 'number' ? resultado.afectados : null;
  const nombreDe = (clave: string, v: unknown) =>
    typeof v === 'string' || typeof v === 'number' ? nombres[`${clave}:${v}`] ?? null : null;
  // Nombres de una lista de ids, null si falta alguno
  const nombresDe = (clave: string, lista: unknown): string[] | null => {
    if (!Array.isArray(lista) || lista.length === 0) return null;
    const salida = lista.map((x) => nombreDe(clave, x && typeof x === 'object' ? obj(x)[clave] : x));
    return salida.every((n): n is string => !!n) ? salida : null;
  };

  switch (d.accion) {
    case 'derecha.reordenar':
    case 'numor.reordenar': {
      const derecha = d.accion === 'derecha.reordenar';
      const grupo = [nombreDe('grado_id', body.grado_id), derecha ? null : nombreDe('escalafon_id', body.escalafon_id)]
        .filter(Boolean)
        .join(' ');
      const frase = `Reordenó ${derecha ? 'la derecha' : 'el numor'}${grupo ? ` de ${grupo}` : ''}`;
      const cuantos =
        afectados === null ? '' : `: ${plural(afectados, 'funcionario cambió', 'funcionarios cambiaron')} de posición`;
      return conMotivo(frase + cuantos, body.motivo);
    }
    case 'derecha.cambios': {
      const cambios = Array.isArray(body.cambios) ? body.cambios.length : 0;
      if (!cambios) return conMotivo(FIJAS[d.accion], body.motivo);
      return conMotivo(`Aplicó ${plural(cambios, 'cambio', 'cambios')} en la derecha`, body.motivo);
    }
    case 'LOGIN_FALLIDO': {
      const usuario = texto(detalle.username);
      return `Intento fallido de inicio de sesión${usuario ? ` con el usuario ${usuario}` : ''}`;
    }
    case 'RESETEAR_PASSWORD':
      return nombre ? `Reseteó la contraseña del usuario ${nombre}` : 'Reseteó la contraseña de un usuario';
    case 'unidad.asignar':
    case 'unidad.quitar': {
      const usuario = texto(detalle.usuario) ?? nombre;
      const quien = `al usuario${usuario ? ` ${usuario}` : ''}`;
      if (d.accion === 'unidad.quitar') return `Quitó bases ${quien}`;
      const bases = listaDenominaciones(detalle.unidadesNuevas);
      return bases ? `Asignó las bases ${bases} ${quien}` : `Cambió las bases ${quien}`;
    }
    case 'unidad_rol.agregar':
    case 'unidad_rol.quitar': {
      const rol = texto(obj(detalle.rol).nombre);
      const base = texto(obj(detalle.unidad).denominacion) ?? nombre;
      const agrega = d.accion === 'unidad_rol.agregar';
      return `${agrega ? 'Agregó' : 'Quitó'} el rol${rol ? ` ${rol}` : ''} ${agrega ? 'a' : 'de'} la base${base ? ` ${base}` : ''}`;
    }
    case 'ascenso.registrar': {
      const orden = texto(body.numero_orden) ?? nombre;
      const cuantos = Array.isArray(body.funcionarios) ? body.funcionarios.length : 0;
      const quienes = cuantos ? ` con ${cuantos} ${cuantos === 1 ? 'ascenso' : 'ascensos'}` : '';
      return `Registró la orden de ascenso${orden ? ` ${orden}` : ''}${quienes}`;
    }
  }

  // Sin datos se usa la frase fija
  if (FIJAS[d.accion]) return FIJAS[d.accion];
  if (!entidad) return null;

  if (entidad === 'Asignación a misión') {
    const convocatoria = nombreParam('convocatoriaId') ?? nombreParam('misionId');
    const en = convocatoria ? ` la convocatoria ${convocatoria}` : ' la convocatoria';
    if (d.accion === 'ELIMINAR' && params.personaId === undefined) {
      return `Quitó a todos los funcionarios de${en}`;
    }
    if (d.accion === 'CREAR' && Array.isArray(body.funcionarios)) {
      const quienes = nombresDe('persona_id', body.funcionarios);
      const n = body.funcionarios.length;
      return `Asignó ${quienes ? `a ${enumerar(quienes)}` : plural(n, 'funcionario', 'funcionarios')} a${en}`;
    }
  }
  if (entidad === 'Asignación de comisión' && d.accion === 'CREAR') {
    const comision = nombreDe('comision_id', body.comision_id);
    const ids = Array.isArray(body.persona_ids) ? body.persona_ids : body.persona_id !== undefined ? [body.persona_id] : [];
    const quienes = nombresDe(Array.isArray(body.persona_ids) ? 'persona_ids' : 'persona_id', ids);
    if (comision && ids.length) {
      return `Asignó ${quienes ? `a ${enumerar(quienes)}` : plural(ids.length, 'funcionario', 'funcionarios')} a la comisión ${comision}`;
    }
  }
  // Desde subalternos también se borran civiles
  if (entidad === 'Subalterno' && d.accion === 'ELIMINAR' && obj(detalle.anterior).es_civil === true) {
    return `Eliminó ${fraseEntidad('Persona', nombre)}`;
  }
  if (entidad === 'Designación de curso' && d.accion === 'CREAR' && Array.isArray(body.persona_ids)) {
    const curso = nombreParam('cursoId') ?? nombre;
    const quienes = nombresDe('persona_ids', body.persona_ids);
    const n = body.persona_ids.length;
    return `Designó ${quienes ? `a ${enumerar(quienes)}` : plural(n, 'funcionario', 'funcionarios')} al curso${curso ? ` ${curso}` : ''}`;
  }
  if (entidad.startsWith('Documento de') && d.accion === 'CREAR') {
    return `Adjuntó ${fraseEntidad(entidad, nombre, true)}`;
  }
  if (entidad === 'Calificación de curso' && d.accion === 'ACTUALIZAR') {
    const curso = nombreParam('cursoId') ?? nombre;
    return `Registró resultados del curso${curso ? ` ${curso}` : ''}`;
  }

  // En los vínculos los nombres salen de los params
  if (d.accion === 'ASIGNAR' || d.accion === 'DESASIGNAR') {
    const asigna = d.accion === 'ASIGNAR';
    const permiso = nombreParam('permisoId');
    const rol = nombreParam('rolId');
    if (entidad === 'Rol' && params.permisoId !== undefined) {
      return `${asigna ? 'Asignó' : 'Quitó'} el permiso${permiso ? ` ${permiso}` : ''} ${asigna ? 'al' : 'del'} rol${nombre ? ` ${nombre}` : ''}`;
    }
    if (entidad === 'Usuario' && params.rolId !== undefined) {
      return `${asigna ? 'Asignó' : 'Quitó'} el rol${rol ? ` ${rol}` : ''} ${asigna ? 'al' : 'del'} usuario${nombre ? ` ${nombre}` : ''}`;
    }
    if (entidad === 'Familiar') {
      const familiar = nombre ?? texto(resultado.nombre_completo);
      const persona = nombreParam('id');
      return `${asigna ? 'Vinculó' : 'Desvinculó'} a ${familiar ?? 'un familiar'} como familiar${persona ? ` de ${persona}` : ''}`;
    }
  }

  // Eventos viejos de familiares, auditados como Persona.
  if (entidad === 'Persona' && d.accion === 'CREAR' && params.id !== undefined) {
    const familiar = texto(resultado.nombre_completo);
    return `Vinculó ${familiar ? `a ${familiar} como familiar` : 'un familiar'}${nombre ? ` de ${nombre}` : ''}`;
  }
  if (entidad === 'Persona' && d.accion === 'ELIMINAR' && params.familiarId !== undefined) {
    const familiar = nombreParam('familiarId');
    return `Desvinculó a ${familiar ?? 'un familiar'} como familiar${nombre ? ` de ${nombre}` : ''}`;
  }
  if (entidad === 'Persona' && body.cambio !== undefined) {
    const situacion = texto(obj(resultado.situacion).denominacion);
    return `Cambió la situación${nombre ? ` de ${nombre}` : ''}${situacion ? ` a ${situacion}` : ''}`;
  }

  if (entidad === 'Invitación' && d.accion === 'ELIMINAR') {
    return `Revocó la invitación${nombre ? ` de ${nombre}` : ''}`;
  }
  if (entidad === 'Invitación' && d.accion === 'CREAR') {
    const email = nombre ?? texto(body.email);
    return `Invitó a ${email ?? 'un usuario nuevo'}`;
  }

  if (entidad.startsWith('Carga masiva')) {
    const de = entidad.slice('Carga masiva'.length).trim();
    const total = typeof resultado.total === 'number' ? resultado.total : null;
    const errores = typeof resultado.errores === 'number' ? resultado.errores : 0;
    const filas = total === null ? '' : `: ${total} ${total === 1 ? 'fila' : 'filas'}${errores ? `, ${errores} con error` : ''}`;
    return `Hizo una carga masiva${de ? ` ${de}` : ''}${filas}`;
  }
  if (entidad === 'Reporte' && d.accion === 'CREAR') {
    const fuente = texto(body.fuente);
    return `Generó un reporte${fuente ? ` de ${fuente}` : ''}`;
  }

  const verbo = VERBOS[d.accion];
  if (!verbo) return null;
  return `${verbo} ${fraseEntidad(entidad, nombre, d.accion === 'CREAR')}`;
}

// Frase y diff para un registro manual
export function detalleLegible(
  resumen: DatosResumen,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): { descripcion?: string; cambios?: CambioAuditoria[] } {
  try {
    const descripcion = armarResumen(resumen);
    return { ...(descripcion && { descripcion }), cambios: calcularCambios(antes, despues) };
  } catch {
    return {};
  }
}

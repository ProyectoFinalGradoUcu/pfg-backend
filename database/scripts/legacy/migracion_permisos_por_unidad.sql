-- ============================================================================
-- Spec 002 — Permisos y segmentación por unidad
--
-- Idempotente: se puede correr más de una vez sin efectos secundarios.
--
-- IMPORTANTE — cambio de comportamiento: los endpoints de /reportes dejan de
-- responder a `auditoria.ver` y pasan a `reportes.ejecutar`. Este script otorga
-- el permiso nuevo a los roles que hoy ejecutan reportes para que nadie pierda
-- acceso al desplegar. Si tenés roles propios fuera de los tres base, revisá la
-- verificación del final antes de dar la migración por terminada.
-- ============================================================================

BEGIN;

-- ─── 1. Estructura ──────────────────────────────────────────────────────────

-- Roles asignados a una unidad. Espejo exacto de usuarios_roles.
CREATE TABLE IF NOT EXISTS unidades_roles (
  unidad_id BIGINT NOT NULL REFERENCES unidades (id),
  rol_id    BIGINT NOT NULL REFERENCES roles (id),
  PRIMARY KEY (unidad_id, rol_id)
);

CREATE INDEX IF NOT EXISTS idx_unidades_roles_rol ON unidades_roles (rol_id);

-- Invalidación de sesiones: los JWT emitidos antes de este momento dejan de valer.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS sesiones_invalidas_desde TIMESTAMP NULL;

-- Unidad del USUARIO DEL SISTEMA. Se asigna directamente y no se deriva de la
-- relación laboral: un usuario de la aplicación no es necesariamente un
-- funcionario del padrón. Se compara contra relaciones_laborales.unidad_id para
-- resolver qué personal ve. NULL = sin unidad, solo opera con permisos globales.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS unidad_id BIGINT NULL REFERENCES unidades (id);

CREATE INDEX IF NOT EXISTS idx_usuarios_unidad ON usuarios (unidad_id);

-- Unidad dueña del curso. NULL = curso general de la fuerza.
-- Los cursos ya existentes quedan en NULL a propósito: así nadie pierde
-- visibilidad el día del despliegue.
ALTER TABLE cursos
  ADD COLUMN IF NOT EXISTS unidad_id BIGINT NULL REFERENCES unidades (id);

CREATE INDEX IF NOT EXISTS idx_cursos_unidad ON cursos (unidad_id);

-- Se usa en cada invalidación masiva por unidad.
CREATE INDEX IF NOT EXISTS idx_relaciones_laborales_unidad_activa
  ON relaciones_laborales (unidad_id)
  WHERE fecha_fin IS NULL;

-- ─── 2. Permisos nuevos ─────────────────────────────────────────────────────

INSERT INTO permisos (nombre, descripcion, aplicacion)
SELECT nombre, descripcion, 'personal' FROM (VALUES
  ('unidades.ver',              'Consultar unidades y los roles que tienen asignados'),
  ('unidades.gestionar',        'Asignar y quitar roles de una unidad'),
  ('reportes.ejecutar',         'Ejecutar y exportar reportes de toda la fuerza'),
  ('personas.ver.unidad',       'Consultar únicamente el personal de la propia unidad'),
  ('personas.crear.unidad',     'Dar de alta personal únicamente en la propia unidad'),
  ('personas.editar.unidad',    'Modificar únicamente el personal de la propia unidad'),
  ('personas.eliminar.unidad',  'Eliminar únicamente el personal de la propia unidad'),
  ('cursos.ver.unidad',         'Consultar los cursos de la propia unidad y los generales'),
  ('cursos.gestionar.unidad',   'Crear y modificar únicamente los cursos de la propia unidad'),
  ('reportes.ejecutar.unidad',  'Ejecutar reportes acotados a la propia unidad')
) AS t(nombre, descripcion)
ON CONFLICT (nombre, aplicacion) DO NOTHING;

-- ─── 3. Otorgar los permisos nuevos a los roles base ────────────────────────

-- Administrador del sistema: todo, incluidos los permisos nuevos.
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Administrador del sistema'
  AND r.aplicacion = 'personal'
  AND p.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- Oficina de Personal: consulta de unidades y reportes de alcance general.
-- `reportes.ejecutar` es imprescindible: sin él pierde los reportes que hoy
-- ejecuta con `auditoria.ver`.
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.aplicacion = 'personal' AND p.nombre IN (
  'unidades.ver',
  'reportes.ejecutar'
)
WHERE r.nombre = 'Oficina de Personal'
  AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- Red de seguridad: cualquier otro rol que hoy tenga `auditoria.ver` conserva
-- el acceso a reportes tras la migración.
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT rp.rol_id, nuevo.id
FROM roles_permisos rp
JOIN permisos viejo ON viejo.id = rp.permiso_id
                   AND viejo.nombre = 'auditoria.ver'
                   AND viejo.aplicacion = 'personal'
CROSS JOIN permisos nuevo
WHERE nuevo.nombre = 'reportes.ejecutar'
  AND nuevo.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- ─── 4. Acciones de auditoría ───────────────────────────────────────────────

INSERT INTO acciones (nombre, descripcion)
SELECT nombre, descripcion FROM (VALUES
  ('unidad_rol.agregar',              'Se asignó un rol a una unidad'),
  ('unidad_rol.quitar',               'Se quitó un rol de una unidad'),
  ('relacion_laboral.cambio_unidad',  'Se cambió el destino de un funcionario')
) AS t(nombre, descripcion)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO contextos (nombre, descripcion)
SELECT 'Unidades', 'Gestión de unidades y sus roles'
ON CONFLICT (nombre) DO NOTHING;

COMMIT;

-- ============================================================================
-- Verificación (correr después del COMMIT; ninguna debe devolver filas)
-- ============================================================================

-- 1. Roles que ejecutaban reportes vía auditoria.ver y se quedaron sin acceso.
--    Si devuelve filas, esos roles perdieron los reportes: otorgales
--    reportes.ejecutar a mano antes de dar la migración por buena.
--
-- SELECT r.nombre
-- FROM roles r
-- JOIN roles_permisos rp ON rp.rol_id = r.id
-- JOIN permisos p ON p.id = rp.permiso_id AND p.nombre = 'auditoria.ver'
-- WHERE r.aplicacion = 'personal'
--   AND NOT EXISTS (
--     SELECT 1 FROM roles_permisos rp2
--     JOIN permisos p2 ON p2.id = rp2.permiso_id AND p2.nombre = 'reportes.ejecutar'
--     WHERE rp2.rol_id = r.id
--   );

-- 2. Usuarios con permiso de alcance de unidad pero sin unidad activa.
--    Estos usuarios reciben 403: no se degradan a alcance global.
--
-- SELECT u.username
-- FROM usuarios u
-- JOIN usuarios_roles ur ON ur.usuario_id = u.id
-- JOIN roles_permisos rp ON rp.rol_id = ur.rol_id
-- JOIN permisos p ON p.id = rp.permiso_id AND p.nombre LIKE '%.unidad'
-- WHERE u.aplicacion = 'personal'
--   AND NOT EXISTS (
--     SELECT 1 FROM relaciones_laborales rl
--     WHERE rl.persona_id = u.persona_id AND rl.fecha_fin IS NULL
--   );

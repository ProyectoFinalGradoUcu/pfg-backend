-- ============================================================================
-- Escenario de prueba manual — Spec 002: permisos y segmentación por unidad
--
-- Aplicar con:
--   docker exec -i postgres psql -U pfg_user -d pfg_database < database/scripts/seed_demo_permisos_unidad.sql
--
-- Requiere haber corrido antes: seed.sql, seed_auth.sql y
-- migracion_permisos_por_unidad.sql (esta última la aplica `make db`).
--
-- Idempotente: se puede repetir.
--
-- Deja armado:
--   · Unidad "Escuela de Formación" (EF) con el rol "Control de cursos"
--   · Usuario  jefe.ef@fau.mil.uy  → unidad EF, alcance de UNIDAD
--   · Usuario  jefe.cg@fau.mil.uy  → unidad Cuartel General, alcance de UNIDAD
--   · 2 funcionarios en EF y 2 en Cuartel General
--
-- Contraseña de los dos usuarios: FAUdemo1!
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. Unidad nueva ────────────────────────────────────────────────────────

INSERT INTO unidades (codigo, denominacion)
VALUES ('EF', 'Escuela de Formación')
ON CONFLICT (codigo) DO NOTHING;

-- ─── 2. Rol con permisos de ALCANCE DE UNIDAD ───────────────────────────────
-- Nótese la mezcla intencional: gestiona cursos solo de su unidad, pero ve
-- personal solo de su unidad también. Cambiando `personas.ver.unidad` por
-- `personas.ver` se puede observar la diferencia entre los dos alcances.

INSERT INTO roles (nombre, descripcion, aplicacion)
VALUES ('Control de cursos', 'Administra la formación de su unidad', 'personal')
ON CONFLICT (nombre, aplicacion) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.aplicacion = 'personal' AND p.nombre IN (
  'personas.ver.unidad',
  'cursos.ver.unidad',
  'cursos.gestionar.unidad'
)
WHERE r.nombre = 'Control de cursos' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- ─── 3. El rol se asigna a la UNIDAD, no a los usuarios ─────────────────────
-- Esta es la pieza central de la spec: los integrantes lo heredan.

INSERT INTO unidades_roles (unidad_id, rol_id)
SELECT u.id, r.id
FROM unidades u
CROSS JOIN roles r
WHERE u.codigo = 'EF'
  AND r.nombre = 'Control de cursos'
  AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

INSERT INTO unidades_roles (unidad_id, rol_id)
SELECT u.id, r.id
FROM unidades u
CROSS JOIN roles r
WHERE u.codigo = 'CG'
  AND r.nombre = 'Control de cursos'
  AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- ─── 4. Personas de prueba ──────────────────────────────────────────────────

INSERT INTO personas (cedula, primer_nombre, primer_apellido)
VALUES
  ('90000001', 'Ana',    'Jefa EF'),
  ('90000002', 'Bruno',  'Alumno EF'),
  ('90000003', 'Carla',  'Jefa CG'),
  ('90000004', 'Diego',  'Oficinista CG')
ON CONFLICT (cedula) DO NOTHING;

-- Relación laboral activa: es la que determina la unidad y, con ella, los
-- permisos heredados y el alcance de datos.
INSERT INTO relaciones_laborales (
  persona_id, regimen_id, unidad_id, programa_id, situacion_id,
  escalafon_id, grado_id, fecha_inicio, estado
)
SELECT
  per.id,
  (SELECT id FROM regimenes   WHERE numero_ley = 'LEY19101'),
  uni.id,
  (SELECT id FROM programas   WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  (SELECT id FROM grados      WHERE codigo = 'SG'),
  DATE '2020-01-01',
  'activo'
FROM (VALUES
  ('90000001', 'EF'),
  ('90000002', 'EF'),
  ('90000003', 'CG'),
  ('90000004', 'CG')
) AS t(cedula, unidad_codigo)
JOIN personas per ON per.cedula = t.cedula
JOIN unidades uni ON uni.codigo = t.unidad_codigo
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl
  WHERE rl.persona_id = per.id AND rl.fecha_fin IS NULL
);

-- ─── 5. Usuarios SIN roles directos, con unidad asignada ────────────────────
-- Dos cosas a propósito:
--   · No tienen roles directos: todo lo que pueden hacer viene heredado de su unidad.
--   · `unidad_id` se asigna a la CUENTA. No se deriva de la persona: un usuario del
--     sistema no es necesariamente un funcionario del padrón. Acá además se les vincula
--     una persona, pero es solo para mostrar el nombre.

INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id, unidad_id)
SELECT
  t.username,
  crypt('FAUdemo1!', gen_salt('bf', 12)),
  'activo',
  'personal',
  per.id,
  uni.id
FROM (VALUES
  ('jefe.ef@fau.mil.uy', '90000001', 'EF'),
  ('jefe.cg@fau.mil.uy', '90000003', 'CG')
) AS t(username, cedula, unidad_codigo)
JOIN personas per ON per.cedula = t.cedula
JOIN unidades uni ON uni.codigo = t.unidad_codigo
ON CONFLICT (username, aplicacion) DO NOTHING;

-- Si los usuarios ya existían de una corrida anterior, asegurar su unidad.
UPDATE usuarios us
SET unidad_id = uni.id
FROM (VALUES
  ('jefe.ef@fau.mil.uy', 'EF'),
  ('jefe.cg@fau.mil.uy', 'CG')
) AS t(username, unidad_codigo)
JOIN unidades uni ON uni.codigo = t.unidad_codigo
WHERE us.username = t.username
  AND us.aplicacion = 'personal'
  AND us.unidad_id IS DISTINCT FROM uni.id;

-- ─── 6. Cursos: uno por unidad + uno general ────────────────────────────────

INSERT INTO cursos (nombre_curso, institucion, es_obligatorio, unidad_id)
SELECT 'Curso de Instrucción Básica', 'EF', true, (SELECT id FROM unidades WHERE codigo = 'EF')
WHERE NOT EXISTS (SELECT 1 FROM cursos WHERE nombre_curso = 'Curso de Instrucción Básica');

INSERT INTO cursos (nombre_curso, institucion, es_obligatorio, unidad_id)
SELECT 'Curso de Estado Mayor', 'CG', true, (SELECT id FROM unidades WHERE codigo = 'CG')
WHERE NOT EXISTS (SELECT 1 FROM cursos WHERE nombre_curso = 'Curso de Estado Mayor');

-- unidad_id NULL = curso general de la fuerza: visible para todos,
-- gestionable solo con alcance global.
INSERT INTO cursos (nombre_curso, institucion, es_obligatorio, unidad_id)
SELECT 'Curso General de la Fuerza', 'FAU', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM cursos WHERE nombre_curso = 'Curso General de la Fuerza');

COMMIT;

-- ============================================================================
-- Qué quedó armado
-- ============================================================================

SELECT u.codigo AS unidad, r.nombre AS rol_heredado, p.nombre AS permiso
FROM unidades u
JOIN unidades_roles ur ON ur.unidad_id = u.id
JOIN roles r          ON r.id = ur.rol_id
JOIN roles_permisos rp ON rp.rol_id = r.id
JOIN permisos p        ON p.id = rp.permiso_id
ORDER BY u.codigo, p.nombre;

SELECT us.username,
       uni.denominacion AS unidad_de_la_cuenta,
       destino.denominacion AS destino_del_funcionario,
       (SELECT count(*) FROM usuarios_roles x WHERE x.usuario_id = us.id) AS roles_directos
FROM usuarios us
LEFT JOIN unidades uni            ON uni.id = us.unidad_id
LEFT JOIN personas per            ON per.id = us.persona_id
LEFT JOIN relaciones_laborales rl ON rl.persona_id = per.id AND rl.fecha_fin IS NULL
LEFT JOIN unidades destino        ON destino.id = rl.unidad_id
WHERE us.username LIKE 'jefe.%'
ORDER BY us.username;

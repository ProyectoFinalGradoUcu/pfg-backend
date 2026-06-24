BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO permisos (nombre, descripcion, aplicacion)
SELECT nombre, descripcion, 'personal' FROM (VALUES
  ('personas.ver',                    'Consultar datos de personas'),
  ('personas.crear',                  'Dar de alta personas'),
  ('personas.editar',                 'Modificar datos de personas'),
  ('personas.eliminar',               'Eliminar personas'),
  ('relaciones_laborales.ver',        'Consultar relaciones laborales'),
  ('relaciones_laborales.gestionar',  'Crear y modificar relaciones laborales'),
  ('ascensos.ver',                    'Consultar ascensos'),
  ('ascensos.registrar',              'Registrar ascensos'),
  ('retiros.ver',                     'Consultar retiros'),
  ('retiros.registrar',               'Registrar retiros'),
  ('destinos.ver',                    'Consultar destinos y asignaciones'),
  ('destinos.gestionar',              'Crear y modificar destinos y asignaciones'),
  ('misiones.ver',                    'Consultar misiones'),
  ('misiones.gestionar',              'Crear y modificar misiones'),
  ('vuelos.ver',                      'Consultar vuelos'),
  ('vuelos.gestionar',                'Registrar y modificar vuelos'),
  ('cursos.ver',                      'Consultar cursos y módulos'),
  ('cursos.gestionar',                'Crear y modificar cursos y módulos'),
  ('viviendas.ver',                   'Consultar viviendas de servicio'),
  ('viviendas.gestionar',             'Crear y modificar viviendas y ocupaciones'),
  ('catalogos.ver',                   'Consultar catálogos del sistema'),
  ('catalogos.gestionar',             'Modificar catálogos del sistema'),
  ('usuarios.ver',                    'Consultar usuarios del sistema'),
  ('usuarios.gestionar',              'Crear, modificar y bloquear usuarios'),
  ('roles.ver',                       'Consultar roles y sus permisos'),
  ('roles.gestionar',                 'Crear, modificar roles y asignar permisos'),
  ('auditoria.ver',                   'Consultar la bitácora de auditoría')
) AS t(nombre, descripcion)
ON CONFLICT (nombre, aplicacion) DO NOTHING;

INSERT INTO roles (nombre, descripcion, aplicacion)
SELECT nombre, descripcion, 'personal' FROM (VALUES
  ('Administrador del sistema', 'Acceso completo al sistema'),
  ('Oficina de Personal',       'Operación completa del módulo de Personal'),
  ('Usuario',                   'Acceso de solo lectura al módulo de Personal')
) AS t(nombre, descripcion)
ON CONFLICT (nombre, aplicacion) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Administrador del sistema'
  AND r.aplicacion = 'personal'
  AND p.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.aplicacion = 'personal' AND p.nombre IN (
  'personas.ver', 'personas.crear', 'personas.editar', 'personas.eliminar',
  'relaciones_laborales.ver', 'relaciones_laborales.gestionar',
  'ascensos.ver', 'ascensos.registrar',
  'retiros.ver', 'retiros.registrar',
  'destinos.ver', 'destinos.gestionar',
  'misiones.ver', 'misiones.gestionar',
  'vuelos.ver', 'vuelos.gestionar',
  'cursos.ver', 'cursos.gestionar',
  'viviendas.ver', 'viviendas.gestionar',
  'catalogos.ver', 'catalogos.gestionar'
)
WHERE r.nombre = 'Oficina de Personal'
  AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.aplicacion = 'personal' AND p.nombre IN (
  'personas.ver',
  'relaciones_laborales.ver',
  'ascensos.ver',
  'retiros.ver',
  'destinos.ver',
  'misiones.ver',
  'vuelos.ver',
  'cursos.ver',
  'viviendas.ver',
  'catalogos.ver'
)
WHERE r.nombre = 'Usuario'
  AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

INSERT INTO usuarios (username, password_hash, estado, aplicacion)
VALUES (
  'admin@fau.mil.uy',
  crypt('FAUadmin1!', gen_salt('bf', 12)),
  'activo',
  'personal'
)
ON CONFLICT (username, aplicacion) DO NOTHING;

INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN roles r ON r.nombre = 'Administrador del sistema' AND r.aplicacion = 'personal'
WHERE u.username = 'admin@fau.mil.uy'
  AND u.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

COMMIT;

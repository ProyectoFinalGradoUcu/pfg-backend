BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO permisos (nombre, descripcion) VALUES
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
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO roles (nombre, descripcion) VALUES
  ('Administrador del sistema', 'Acceso completo al sistema'),
  ('Oficina de Personal',       'Operación completa del módulo de Personal'),
  ('Usuario',                   'Acceso de solo lectura al módulo de Personal')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Administrador del sistema'
ON CONFLICT DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.nombre IN (
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
ON CONFLICT DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.nombre IN (
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
ON CONFLICT DO NOTHING;

INSERT INTO usuarios (username, password_hash, estado)
VALUES (
  'admin@fau.mil.uy',
  crypt('FAUadmin1!', gen_salt('bf', 12)),
  'activo'
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN roles r ON r.nombre = 'Administrador del sistema'
WHERE u.username = 'admin@fau.mil.uy'
ON CONFLICT DO NOTHING;

COMMIT;

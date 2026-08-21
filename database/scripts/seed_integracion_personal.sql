-- ============================================================================
-- SEED DE INTEGRACIÓN: Sistema de Gestión de Personal (pfg-backend)
--
-- Prerrequisito: migracion_integracion_personal.sql ya ejecutada.
--
-- Inserta los datos mínimos necesarios para que el sistema de personal
-- arranque en producción: permisos, roles base, usuario administrador,
-- y datos de auditoría.
--
-- Idempotente: usa ON CONFLICT DO NOTHING / DO UPDATE en todos los inserts.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 1: Catálogo de permisos
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO permisos (nombre, descripcion, aplicacion)
SELECT nombre, descripcion, 'personal' FROM (VALUES
  -- Personas
  ('personas.ver',                    'Consultar datos de personas'),
  ('personas.crear',                  'Dar de alta personas'),
  ('personas.editar',                 'Modificar datos de personas'),
  ('personas.eliminar',               'Eliminar personas'),
  -- Relaciones laborales
  ('relaciones_laborales.ver',        'Consultar relaciones laborales'),
  ('relaciones_laborales.gestionar',  'Crear y modificar relaciones laborales'),
  -- Ascensos
  ('ascensos.ver',                    'Consultar ascensos'),
  ('ascensos.registrar',              'Registrar ascensos'),
  -- Retiros
  ('retiros.ver',                     'Consultar retiros'),
  ('retiros.registrar',               'Registrar retiros'),
  -- Destinos
  ('destinos.ver',                    'Consultar destinos y asignaciones'),
  ('destinos.gestionar',              'Crear y modificar destinos y asignaciones'),
  -- Misiones
  ('misiones.ver',                    'Consultar misiones'),
  ('misiones.gestionar',              'Crear y modificar misiones'),
  -- Vuelos
  ('vuelos.ver',                      'Consultar vuelos'),
  ('vuelos.gestionar',                'Registrar y modificar vuelos'),
  -- Cursos
  ('cursos.ver',                      'Consultar cursos y módulos'),
  ('cursos.gestionar',                'Crear y modificar cursos y módulos'),
  -- Viviendas
  ('viviendas.ver',                   'Consultar viviendas de servicio'),
  ('viviendas.gestionar',             'Crear y modificar viviendas y ocupaciones'),
  -- Catálogos
  ('catalogos.ver',                   'Consultar catálogos del sistema'),
  ('catalogos.gestionar',             'Modificar catálogos del sistema'),
  -- Usuarios
  ('usuarios.ver',                    'Consultar usuarios del sistema'),
  ('usuarios.gestionar',              'Crear, modificar y bloquear usuarios'),
  -- Roles
  ('roles.ver',                       'Consultar roles y sus permisos'),
  ('roles.gestionar',                 'Crear, modificar roles y asignar permisos'),
  -- Auditoría
  ('auditoria.ver',                   'Consultar la bitácora de auditoría'),
  -- Unidades
  ('unidades.ver',                    'Consultar unidades y los roles que tienen asignados'),
  ('unidades.gestionar',              'Asignar y quitar roles de una unidad'),
  -- Reportes
  ('reportes.ejecutar',               'Ejecutar y exportar reportes de toda la fuerza'),
  -- Variantes de alcance por unidad (Spec 002)
  ('personas.ver.unidad',             'Consultar únicamente el personal de la propia unidad'),
  ('personas.crear.unidad',           'Dar de alta personal únicamente en la propia unidad'),
  ('personas.editar.unidad',          'Modificar únicamente el personal de la propia unidad'),
  ('personas.eliminar.unidad',        'Eliminar únicamente el personal de la propia unidad'),
  ('cursos.ver.unidad',               'Consultar los cursos de la propia unidad y los generales'),
  ('cursos.gestionar.unidad',         'Crear y modificar únicamente los cursos de la propia unidad'),
  ('reportes.ejecutar.unidad',        'Ejecutar reportes acotados a la propia unidad')
) AS t(nombre, descripcion)
ON CONFLICT (nombre, aplicacion) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 2: Roles base
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO roles (nombre, descripcion, aplicacion)
SELECT nombre, descripcion, 'personal' FROM (VALUES
  ('Administrador del sistema', 'Acceso completo al sistema'),
  ('Oficina de Personal',       'Operación completa del módulo de Personal'),
  ('Usuario',                   'Acceso de solo lectura al módulo de Personal')
) AS t(nombre, descripcion)
ON CONFLICT (nombre, aplicacion) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 3: Asignación de permisos a roles
-- ═══════════════════════════════════════════════════════════════════════════════

-- Administrador: TODOS los permisos de la aplicación 'personal'
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Administrador del sistema'
  AND r.aplicacion = 'personal'
  AND p.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- Oficina de Personal: operación completa + reportes + unidades (lectura)
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
  'catalogos.ver', 'catalogos.gestionar',
  'unidades.ver', 'reportes.ejecutar'
)
WHERE r.nombre = 'Oficina de Personal'
  AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- Usuario: solo lectura
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 4: Usuario administrador inicial
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 5: Datos de auditoría
-- ═══════════════════════════════════════════════════════════════════════════════

-- Acciones de auditoría (complementan las que ya pueda tener liquidaciones)
INSERT INTO acciones (nombre, descripcion)
SELECT nombre, descripcion FROM (VALUES
  ('CREAR',             'Alta de un registro'),
  ('ACTUALIZAR',        'Modificación de un registro'),
  ('ELIMINAR',          'Baja o eliminación de un registro'),
  ('ASIGNAR',           'Asignación de una relación (ej. rol o permiso)'),
  ('DESASIGNAR',        'Quita de una relación (ej. rol o permiso)'),
  ('LOGIN',             'Inicio de sesión exitoso'),
  ('LOGOUT',            'Cierre de sesión'),
  ('LOGIN_FALLIDO',     'Intento de inicio de sesión fallido'),
  ('CAMBIAR_PASSWORD',  'Cambio de contraseña propia'),
  ('RESETEAR_PASSWORD', 'Reseteo de contraseña de otro usuario'),
  ('DESCARGAR',         'Descarga o exportación de datos'),
  ('unidad_rol.agregar',             'Se asignó un rol a una unidad'),
  ('unidad_rol.quitar',              'Se quitó un rol de una unidad'),
  ('relacion_laboral.cambio_unidad', 'Se cambió el destino de un funcionario')
) AS t(nombre, descripcion)
ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion;

-- Contextos de auditoría
INSERT INTO contextos (nombre, descripcion)
SELECT nombre, descripcion FROM (VALUES
  ('Autenticación',       'Acceso al sistema (login, logout, contraseñas)'),
  ('Usuarios',            'Gestión de usuarios del sistema'),
  ('Roles',               'Gestión de roles y sus permisos'),
  ('Permisos',            'Consulta de permisos'),
  ('Personas',            'Gestión de personas'),
  ('Subalternos',         'Gestión de subalternos'),
  ('Misiones',            'Gestión de misiones'),
  ('Cursos',              'Gestión de cursos, módulos y designaciones'),
  ('Historial de cursos', 'Registro histórico de cursos por funcionario'),
  ('Catálogos',           'Catálogos del sistema'),
  ('Archivos',            'Carga y borrado de archivos'),
  ('Unidades',            'Gestión de unidades y sus roles')
) AS t(nombre, descripcion)
ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion;

COMMIT;

-- ============================================================================
-- FIN DE SEED
-- ============================================================================

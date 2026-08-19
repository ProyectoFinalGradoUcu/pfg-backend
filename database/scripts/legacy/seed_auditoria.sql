BEGIN;

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
  ('DESCARGAR',         'Descarga o exportación de datos')
) AS t(nombre, descripcion)
ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion;

INSERT INTO contextos (nombre, descripcion)
SELECT nombre, descripcion FROM (VALUES
  ('Autenticación',       'Acceso al sistema (login, logout, contraseñas)'),
  ('Usuarios',            'Gestión de usuarios del sistema'),
  ('Roles',               'Gestión de roles y sus permisos'),
  ('Permisos',            'Consulta de permisos'),
  ('Personas',            'Gestión de personas'),
  ('Subalternos',         'Gestión de subalternos'),
  ('Misiones',            'Gestión de misiones'),
  ('Destinos',            'Asignación de funcionarios a unidades'),
  ('Cursos',              'Gestión de cursos, módulos y designaciones'),
  ('Historial de cursos', 'Registro histórico de cursos por funcionario'),
  ('Catálogos',           'Catálogos del sistema'),
  ('Archivos',            'Carga y borrado de archivos')
) AS t(nombre, descripcion)
ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion;

COMMIT;

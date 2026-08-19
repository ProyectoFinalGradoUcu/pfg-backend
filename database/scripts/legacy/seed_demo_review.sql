BEGIN;

INSERT INTO public.cursos (nombre_curso)
SELECT v.nombre_curso
FROM (VALUES
  ('Curso de pasaje de grado'),
  ('Curso de pasaje de grado de Sgto. para Sgto. 1°'),
  ('Curso Nivel 7'),
  ('Curso de supervisor académico nivel 9'),
  ('Curso básico')
) AS v(nombre_curso)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cursos c WHERE c.nombre_curso = v.nombre_curso
);

INSERT INTO public.misiones
  (pais, tipo_mision, fecha_salida, fecha_llegada, numero_orden, boletin, comando_responsable, observaciones)
SELECT v.pais, v.tipo_mision, v.fecha_salida::date, v.fecha_llegada::date,
       v.numero_orden, v.boletin, v.comando_responsable, v.observaciones
FROM (VALUES
  ('República Democrática del Congo',
   'Misión de paz ONU - MONUSCO',
   '2010-03-15', '2024-06-30',
   'O.D. 245/2010', 'B.P. 12/2010', 'Comando Aéreo de Operaciones',
   'Unidad Aérea Uruguaya (URUAVU), helicópteros Bell 212. Despliegue real 2010-2024; fechas exactas y nros. de orden ficticios para la demo.'),
  ('Haití',
   'Misión de paz ONU - MINUSTAH',
   '2008-04-10', '2011-05-20',
   'O.D. 088/2008', 'B.P. 04/2008', 'Comando Aéreo de Operaciones',
   'Contingente FAU 2008-2011, avión C-212 Aviocar en Puerto Príncipe. Fechas exactas y nros. de orden ficticios para la demo.'),
  ('Antártida',
   'Apoyo logístico antártico - Base Científica Antártica Artigas',
   '2024-11-05', '2025-03-10',
   'O.D. 301/2024', 'B.P. 11/2024', 'Comando Aéreo de Operaciones',
   'Puente aéreo C-130 Hércules KC-130H a la BCAA (campaña 2024-2025). Campaña anual recurrente; fechas y nros. de orden ficticios para la demo.')
) AS v(pais, tipo_mision, fecha_salida, fecha_llegada, numero_orden, boletin, comando_responsable, observaciones)
WHERE NOT EXISTS (
  SELECT 1 FROM public.misiones m
  WHERE m.pais = v.pais AND m.tipo_mision = v.tipo_mision
);

INSERT INTO public.escalafones (codigo, denominacion)
VALUES ('AT', 'Aerotécnico')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.grados (escalafon_id, codigo, denominacion, orden, es_oficial, es_subalterno)
SELECT e.id, 'SAT', 'Supervisor Aerotécnico', 10, false, true
FROM public.escalafones e
WHERE e.codigo = 'AT'
  AND NOT EXISTS (
    SELECT 1 FROM public.grados g WHERE g.codigo = 'SAT' AND g.escalafon_id = e.id
  );

INSERT INTO public.situaciones (codigo, denominacion, sistema_salud)
VALUES ('RET', 'Retiro', 'ssffaa')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.personas
  (cedula, primer_nombre, primer_apellido, fecha_nacimiento, email, telefono, direccion)
VALUES
  ('41234567', 'Martín', 'González', DATE '1985-06-12', 'martin.gonzalez@fau.mil.uy', '099111222', 'Av. Italia 1234'),
  ('42345678', 'Lucía',  'Fernández', DATE '1990-09-03', 'lucia.fernandez@fau.mil.uy', '099333444', 'Bvar. Artigas 567'),
  ('43456789', 'Diego',  'Rodríguez', DATE '1980-01-25', 'diego.rodriguez@fau.mil.uy', '099555666', 'Camino Carrasco 890')
ON CONFLICT (cedula) DO NOTHING;

INSERT INTO public.relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, fecha_fin, estado)
SELECT
  (SELECT id FROM public.personas    WHERE cedula = '41234567'),
  (SELECT id FROM public.regimenes   WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM public.unidades    WHERE codigo = 'CG'),
  (SELECT id FROM public.programas   WHERE codigo = 'PROG01'),
  (SELECT id FROM public.situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM public.escalafones WHERE codigo = 'ST'),
  (SELECT id FROM public.grados WHERE codigo = 'C1' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST')),
  DATE '2008-01-15', DATE '2012-01-31', 'inactivo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.relaciones_laborales rl
  WHERE rl.persona_id = (SELECT id FROM public.personas WHERE cedula = '41234567')
    AND rl.grado_id = (SELECT id FROM public.grados WHERE codigo = 'C1' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST'))
);

INSERT INTO public.relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, fecha_fin, estado)
SELECT
  (SELECT id FROM public.personas   WHERE cedula = '41234567'),
  (SELECT id FROM public.regimenes  WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM public.unidades   WHERE codigo = 'CG'),
  (SELECT id FROM public.programas  WHERE codigo = 'PROG01'),
  (SELECT id FROM public.situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM public.escalafones WHERE codigo = 'ST'),
  (SELECT id FROM public.grados WHERE codigo = 'SG' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST')),
  DATE '2012-02-01', NULL, 'activo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.relaciones_laborales rl
  WHERE rl.persona_id = (SELECT id FROM public.personas WHERE cedula = '41234567')
    AND rl.grado_id = (SELECT id FROM public.grados WHERE codigo = 'SG' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST'))
);

INSERT INTO public.ascensos (persona_id, grado_id, fecha_ascenso, observaciones)
SELECT
  (SELECT id FROM public.personas WHERE cedula = '41234567'),
  (SELECT id FROM public.grados WHERE codigo = 'SG' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST')),
  DATE '2012-02-01', 'O.D. 045/2012'
WHERE NOT EXISTS (
  SELECT 1 FROM public.ascensos a
  WHERE a.persona_id = (SELECT id FROM public.personas WHERE cedula = '41234567')
    AND a.grado_id = (SELECT id FROM public.grados WHERE codigo = 'SG' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST'))
);

INSERT INTO public.relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, fecha_fin, estado)
SELECT
  (SELECT id FROM public.personas   WHERE cedula = '42345678'),
  (SELECT id FROM public.regimenes  WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM public.unidades   WHERE codigo = 'CG'),
  (SELECT id FROM public.programas  WHERE codigo = 'PROG01'),
  (SELECT id FROM public.situaciones WHERE codigo = 'RET'),
  (SELECT id FROM public.escalafones WHERE codigo = 'ST'),
  (SELECT id FROM public.grados WHERE codigo = 'C1' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST')),
  DATE '2016-03-01', NULL, 'inactivo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.relaciones_laborales rl
  WHERE rl.persona_id = (SELECT id FROM public.personas WHERE cedula = '42345678')
);

INSERT INTO public.relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado)
SELECT
  (SELECT id FROM public.personas   WHERE cedula = '43456789'),
  (SELECT id FROM public.regimenes  WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM public.unidades   WHERE codigo = 'CG'),
  (SELECT id FROM public.programas  WHERE codigo = 'PROG01'),
  (SELECT id FROM public.situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM public.escalafones WHERE codigo = 'AT'),
  (SELECT id FROM public.grados WHERE codigo = 'SAT' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'AT')),
  DATE '2008-01-15', 'activo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.relaciones_laborales rl
  WHERE rl.persona_id = (SELECT id FROM public.personas WHERE cedula = '43456789')
);

INSERT INTO public.funcionarios_misiones
  (persona_id, mision_id, boletin, observaciones, numero_control_migratorio)
SELECT
  (SELECT id FROM public.personas WHERE cedula = '41234567'),
  (SELECT id FROM public.misiones
     WHERE pais = 'República Democrática del Congo'
       AND tipo_mision = 'Misión de paz ONU - MONUSCO'
     LIMIT 1),
  'B.P. 12/2010',
  'Integrante de la Unidad Aérea Uruguaya (URUAVU). Asignación de demo (ficticia).',
  'CM-2010-0457'
ON CONFLICT (persona_id, mision_id) DO NOTHING;

INSERT INTO public.funcionarios_cursos (persona_id, curso_id, fecha_inicio, fecha_fin, calificacion)
SELECT
  (SELECT id FROM public.personas WHERE cedula = '41234567'),
  (SELECT id FROM public.cursos
     WHERE nombre_curso = 'Curso de pasaje de grado de Sgto. para Sgto. 1°'
     LIMIT 1),
  DATE '2025-03-01', NULL, NULL
ON CONFLICT (persona_id, curso_id) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.usuarios (username, password_hash, estado, persona_id)
SELECT 'diego.rodriguez@fau.mil.uy', crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo',
       (SELECT id FROM public.personas WHERE cedula = '43456789')
WHERE NOT EXISTS (
  SELECT 1 FROM public.usuarios WHERE username = 'diego.rodriguez@fau.mil.uy'
);

INSERT INTO public.usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM public.usuarios u
JOIN public.roles r ON r.nombre = 'Oficina de Personal'
WHERE u.username = 'diego.rodriguez@fau.mil.uy'
ON CONFLICT DO NOTHING;

COMMIT;
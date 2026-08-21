BEGIN;

INSERT INTO public.tipos_movimiento (nombre, es_alta)
SELECT v.nombre, v.es_alta
FROM (VALUES ('Alta', true), ('Pase de destino', false), ('Ascenso', false)) AS v(nombre, es_alta)
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_movimiento t WHERE t.nombre = v.nombre);

INSERT INTO public.destinos (ubicacion, numero_orden, tipo_destino)
SELECT v.ubicacion, v.numero_orden, v.tipo_destino
FROM (VALUES
  ('Comando Aéreo de Operaciones (C.O.A.)', 'O.D. 11007', 'Unidad'),
  ('Base Aérea Nº 1 (B.A.I)', 'O.D. 10859', 'Unidad'),
  ('E.M.G.F.A.', 'O.D. 11760', 'Organismo')
) AS v(ubicacion, numero_orden, tipo_destino)
WHERE NOT EXISTS (SELECT 1 FROM public.destinos d WHERE d.ubicacion = v.ubicacion);

INSERT INTO public.asignaciones_funcionario (persona_id, destino_id, fecha_inicio, posicion_destino, observaciones)
SELECT per.id, des.id, v.fecha::date, v.cargo, v.obs
FROM (VALUES
  ('50000001', 'E.M.G.F.A.',                              '2024-04-30', 'Sub-Jefe de Personal A-1', 'Comisión en la ECEMA'),
  ('50000003', 'Comando Aéreo de Operaciones (C.O.A.)',   '2023-02-01', 'Jefe de Sección',          NULL),
  ('50000009', 'Base Aérea Nº 1 (B.A.I)',                 '2022-06-15', 'Encargada de Abastecimiento', NULL)
) AS v(cedula, ubicacion, fecha, cargo, obs)
JOIN public.personas per ON per.cedula = v.cedula
JOIN public.destinos des ON des.ubicacion = v.ubicacion
WHERE NOT EXISTS (
  SELECT 1 FROM public.asignaciones_funcionario a WHERE a.persona_id = per.id AND a.destino_id = des.id
);

INSERT INTO public.movimientos_laborales (relacion_laboral_id, tipo_movimiento_id, fecha_movimiento, puesto)
SELECT rl.id, tm.id, v.fecha::date, v.puesto
FROM (VALUES
  ('50000009', 'Pase de destino', '2024-05-01', 'Abastecimiento'),
  ('50000010', 'Alta',            '2015-01-15', 'Mantenimiento'),
  ('50000011', 'Ascenso',         '2023-02-01', 'Operaciones')
) AS v(cedula, tipo, fecha, puesto)
JOIN public.personas per ON per.cedula = v.cedula
JOIN public.relaciones_laborales rl ON rl.persona_id = per.id AND rl.estado = 'activo'
JOIN public.tipos_movimiento tm ON tm.nombre = v.tipo
WHERE NOT EXISTS (
  SELECT 1 FROM public.movimientos_laborales m
  WHERE m.relacion_laboral_id = rl.id AND m.tipo_movimiento_id = tm.id AND m.fecha_movimiento = v.fecha::date
);

INSERT INTO public.misiones (pais, tipo_mision, fecha_salida, fecha_llegada, numero_orden, boletin, comando_responsable)
SELECT v.pais, v.tipo_mision, v.fsal::date, v.freg::date, v.orden, v.boletin, 'Comando Aéreo de Operaciones'
FROM (VALUES
  ('Brasil',    'Examen de Cámara de Altitud',                    '2009-08-18', '2009-08-25', 'O.D. 9600',  'B.P. 156/09'),
  ('EE.UU.',    'Curso de Piloto y Mecánico Cessna AIR-CRAFT M',  '1998-01-17', '1998-12-20', 'O.D. 9949',  'B.P. 72/98'),
  ('Antártida', 'Vuelo Diciembre 2023 — Campaña Antártica',       '2023-12-08', '2024-03-10', 'O.D. 97600', 'B.P. 11/23')
) AS v(pais, tipo_mision, fsal, freg, orden, boletin)
WHERE NOT EXISTS (SELECT 1 FROM public.misiones m WHERE m.pais = v.pais AND m.tipo_mision = v.tipo_mision);

INSERT INTO public.funcionarios_misiones (persona_id, mision_id, boletin)
SELECT per.id, mis.id, mis.boletin
FROM (VALUES
  ('50000001', 'Examen de Cámara de Altitud'),
  ('50000001', 'Vuelo Diciembre 2023 — Campaña Antártica'),
  ('50000003', 'Curso de Piloto y Mecánico Cessna AIR-CRAFT M')
) AS v(cedula, tipo_mision)
JOIN public.personas per ON per.cedula = v.cedula
JOIN public.misiones mis ON mis.tipo_mision = v.tipo_mision
ON CONFLICT (persona_id, mision_id) DO NOTHING;

INSERT INTO public.ascensos (persona_id, grado_id, fecha_ascenso, observaciones)
SELECT per.id, g.id, v.fecha::date, v.obs
FROM (VALUES
  ('50000001', 'TT2', '2005-02-01', 'O.D. 100/05'),
  ('50000001', 'CAP', '2010-02-01', 'O.D. 145/10'),
  ('50000001', 'MAY', '2016-02-01', 'O.D. 088/16'),
  ('50000001', 'CNL', '2022-02-01', 'O.D. 045/22')
) AS v(cedula, grado_cod, fecha, obs)
JOIN public.personas per ON per.cedula = v.cedula
JOIN public.grados g ON g.codigo = v.grado_cod
WHERE NOT EXISTS (
  SELECT 1 FROM public.ascensos a WHERE a.persona_id = per.id AND a.grado_id = g.id
);

INSERT INTO public.funcionarios_cursos (persona_id, curso_id, fecha_inicio, fecha_fin)
SELECT per.id, c.id, v.fini::date, v.ffin::date
FROM (VALUES
  ('50000001', 1, '1985-03-01', '1985-12-15'),
  ('50000001', 11, '2003-03-01', '2003-11-30')
) AS v(cedula, curso_id, fini, ffin)
JOIN public.personas per ON per.cedula = v.cedula
JOIN public.cursos c ON c.id = v.curso_id
ON CONFLICT (persona_id, curso_id) DO NOTHING;

COMMIT;

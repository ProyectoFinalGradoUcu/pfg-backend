BEGIN;

INSERT INTO public.regimenes (numero_ley, denominacion, es_ley_vieja)
VALUES ('LEY_VIEJA', 'Régimen Ley Vieja (demo)', true)
ON CONFLICT (numero_ley) DO NOTHING;

INSERT INTO public.escalafones (codigo, denominacion)
VALUES ('AV', 'Aviador')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.grados (escalafon_id, codigo, denominacion, orden, es_oficial, es_subalterno)
SELECT e.id, g.codigo, g.denom, g.orden, true, false
FROM public.escalafones e
JOIN (VALUES
  ('CNL', 'Coronel', 2),
  ('MAY', 'Mayor', 4),
  ('CAP', 'Capitán', 5),
  ('TT2', 'Teniente 2º', 7)
) AS g(codigo, denom, orden) ON true
WHERE e.codigo = 'AV'
  AND NOT EXISTS (SELECT 1 FROM public.grados x WHERE x.codigo = g.codigo);

INSERT INTO public.personas (cedula, primer_nombre, primer_apellido, genero, fecha_nacimiento, email)
SELECT p.cedula, p.nombre, p.apellido, p.genero, p.fnac::date, p.email
FROM (VALUES
  ('50000001', 'Ana',       'Pereyra',    'Femenino',  '1978-02-10', 'ana.pereyra@fau.mil.uy'),
  ('50000002', 'Carlos',    'Méndez',     'Masculino', '1976-05-22', 'carlos.mendez@fau.mil.uy'),
  ('50000003', 'Sofía',     'Larrosa',    'Femenino',  '1983-07-01', 'sofia.larrosa@fau.mil.uy'),
  ('50000004', 'Jorge',     'Silva',      'Masculino', '1982-11-15', 'jorge.silva@fau.mil.uy'),
  ('50000005', 'Valentina', 'Cruz',       'Femenino',  '1987-03-30', 'valentina.cruz@fau.mil.uy'),
  ('50000006', 'Pablo',     'Núñez',      'Masculino', '1986-09-09', 'pablo.nunez@fau.mil.uy'),
  ('50000007', 'Mariana',   'Díaz',       'Femenino',  '1991-01-18', 'mariana.diaz@fau.mil.uy'),
  ('50000008', 'Andrés',    'Rey',        'Masculino', '1990-12-05', 'andres.rey@fau.mil.uy'),
  ('50000009', 'Lucía',     'Bentancor',  'Femenino',  '1989-06-12', 'lucia.bentancor@fau.mil.uy'),
  ('50000010', 'Ramón',     'Ferreira',   'Masculino', '1988-08-25', 'ramon.ferreira@fau.mil.uy'),
  ('50000011', 'Camila',    'Suárez',     'Femenino',  '1993-04-14', 'camila.suarez@fau.mil.uy'),
  ('50000012', 'Federico',  'Olivera',    'Masculino', '1992-10-02', 'federico.olivera@fau.mil.uy'),
  ('50000013', 'Paula',     'Vega',       'Femenino',  '1995-05-20', 'paula.vega@fau.mil.uy'),
  ('50000014', 'Gustavo',   'Rodríguez',  'Masculino', '1994-07-07', 'gustavo.rodriguez@fau.mil.uy')
) AS p(cedula, nombre, apellido, genero, fnac, email)
ON CONFLICT (cedula) DO UPDATE SET genero = EXCLUDED.genero;

INSERT INTO public.relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, prima_tecnica)
SELECT
  per.id,
  reg.id,
  (SELECT id FROM public.unidades WHERE codigo = 'CG'),
  (SELECT id FROM public.programas WHERE codigo = 'PROG01'),
  (SELECT id FROM public.situaciones WHERE codigo = 'ACT'),
  esc.id,
  gr.id,
  DATE '2015-01-01',
  'activo',
  m.prima
FROM (VALUES
  ('50000001', 'AV', 'CNL', 'LEY_VIEJA', 'A'),
  ('50000002', 'AV', 'CNL', 'LEY19101',  'VACIO'),
  ('50000003', 'AV', 'MAY', 'LEY19101',  'A'),
  ('50000004', 'AV', 'MAY', 'LEY19101',  'VACIO'),
  ('50000005', 'AV', 'CAP', 'LEY_VIEJA', 'B'),
  ('50000006', 'AV', 'CAP', 'LEY19101',  'VACIO'),
  ('50000007', 'AV', 'TT2', 'LEY19101',  'VACIO'),
  ('50000008', 'AV', 'TT2', 'LEY19101',  'A'),
  ('50000009', 'ST', 'SG',  'LEY19101',  'A'),
  ('50000010', 'ST', 'SG',  'LEY19101',  'VACIO'),
  ('50000011', 'ST', 'C1',  'LEY_VIEJA', 'B'),
  ('50000012', 'ST', 'C1',  'LEY19101',  'VACIO'),
  ('50000013', 'ST', 'C2',  'LEY19101',  'VACIO'),
  ('50000014', 'ST', 'S1',  'LEY19101',  'VACIO')
) AS m(cedula, esc_cod, grado_cod, ley, prima)
JOIN public.personas per ON per.cedula = m.cedula
JOIN public.escalafones esc ON esc.codigo = m.esc_cod
JOIN public.grados gr ON gr.codigo = m.grado_cod AND gr.escalafon_id = esc.id
JOIN public.regimenes reg ON reg.numero_ley = m.ley
WHERE NOT EXISTS (
  SELECT 1 FROM public.relaciones_laborales rl
  WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

COMMIT;

BEGIN;

INSERT INTO public.motivos_baja (codigo, denominacion)
SELECT v.codigo, v.denom
FROM (VALUES
  ('BSOLIC', 'Baja por solicitarla'),
  ('RETOBL', 'Retiro obligatorio')
) AS v(codigo, denom)
WHERE NOT EXISTS (SELECT 1 FROM public.motivos_baja m WHERE m.codigo = v.codigo);

INSERT INTO public.personas (cedula, primer_nombre, primer_apellido, genero, fecha_nacimiento, email)
VALUES ('50000015', 'Juan', 'Rodríguez', 'Masculino', DATE '1985-05-05', 'juan.rodriguez@fau.mil.uy')
ON CONFLICT (cedula) DO NOTHING;

INSERT INTO public.relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, fecha_fin, estado, motivo_baja_id)
SELECT
  (SELECT id FROM public.personas   WHERE cedula = '50000015'),
  (SELECT id FROM public.regimenes  WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM public.unidades   WHERE codigo = 'CG'),
  (SELECT id FROM public.programas  WHERE codigo = 'PROG01'),
  (SELECT id FROM public.situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM public.escalafones WHERE codigo = 'ST'),
  (SELECT id FROM public.grados WHERE codigo = 'SG' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST')),
  DATE '2010-03-01', DATE '2025-10-01', 'inactivo',
  (SELECT id FROM public.motivos_baja WHERE codigo = 'BSOLIC')
WHERE NOT EXISTS (
  SELECT 1 FROM public.relaciones_laborales rl
  WHERE rl.persona_id = (SELECT id FROM public.personas WHERE cedula = '50000015')
);

INSERT INTO public.personas (cedula, primer_nombre, primer_apellido, genero, fecha_nacimiento, email)
VALUES ('50000016', 'Pedro', 'Fernández', 'Masculino', DATE '1968-09-09', 'pedro.fernandez@fau.mil.uy')
ON CONFLICT (cedula) DO NOTHING;

INSERT INTO public.relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, fecha_fin, estado)
SELECT
  (SELECT id FROM public.personas   WHERE cedula = '50000016'),
  (SELECT id FROM public.regimenes  WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM public.unidades   WHERE codigo = 'CG'),
  (SELECT id FROM public.programas  WHERE codigo = 'PROG01'),
  (SELECT id FROM public.situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM public.escalafones WHERE codigo = 'ST'),
  (SELECT id FROM public.grados WHERE codigo = 'SM' AND escalafon_id = (SELECT id FROM public.escalafones WHERE codigo = 'ST')),
  DATE '1990-02-01', DATE '2025-10-01', 'inactivo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.relaciones_laborales rl
  WHERE rl.persona_id = (SELECT id FROM public.personas WHERE cedula = '50000016')
);

INSERT INTO public.retiros (persona_id, fecha_retiro, motivo)
SELECT (SELECT id FROM public.personas WHERE cedula = '50000016'), DATE '2025-10-01', 'Retiro obligatorio'
WHERE NOT EXISTS (
  SELECT 1 FROM public.retiros r WHERE r.persona_id = (SELECT id FROM public.personas WHERE cedula = '50000016')
);

COMMIT;

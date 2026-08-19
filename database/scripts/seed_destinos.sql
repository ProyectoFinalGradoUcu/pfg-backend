-- ─── Demo de destinos: unidades reales + historial de asignaciones ───────────
--
-- Requiere: seed.sql (unidades base) y seed_demo_review.sql (las personas
-- 41234567 / 42345678 / 43456789). Ejecutar DESPUÉS de migration_destinos_v2.sql.
--
-- Deja los tres estados que la UI tiene que saber mostrar:
--   · González  → pase cerrado + destino vigente (por número de orden)
--   · Rodríguez → pase cerrado + destino vigente (por boletín)
--   · Fernández → solo historial, SIN destino vigente (está en Retiro).
--     El listado de personal le devuelve `destino: null`, que es el caso que
--     antes quedaba tapado mostrando la unidad de la relación laboral.

BEGIN;

-- 1. Unidades y organismos de la FAU.
CREATE TEMP TABLE tmp_unidades (codigo VARCHAR(30), denominacion VARCHAR(150), tipo VARCHAR(100))
ON COMMIT DROP;

INSERT INTO tmp_unidades (codigo, denominacion, tipo) VALUES
  ('COA',   'Comando Aéreo de Operaciones (C.O.A.)',   'Unidad'),
  ('BAI',   'Base Aérea Nº 1 (B.A.I)',                 'Unidad'),
  ('BAII',  'Base Aérea Nº 2 (B.A.II)',                'Unidad'),
  ('EMGFA', 'E.M.G.F.A.',                              'Organismo'),
  ('ECEMA', 'Escuela de Comando y Estado Mayor Aéreo', 'Organismo');

-- 1a. La migración cargó estas unidades con un código provisorio (DEST-n).
--     Se les pone el código definitivo en vez de insertarlas de nuevo: si no,
--     quedarían dos unidades distintas con la misma denominación.
UPDATE public.unidades u
SET codigo = t.codigo, tipo = COALESCE(u.tipo, t.tipo)
FROM tmp_unidades t
WHERE u.denominacion = t.denominacion
  AND u.codigo LIKE 'DEST-%'
  AND NOT EXISTS (SELECT 1 FROM public.unidades x WHERE x.codigo = t.codigo);

-- 1b. Insertar solo las que todavía no existen.
INSERT INTO public.unidades (codigo, denominacion, tipo, vigente)
SELECT t.codigo, t.denominacion, t.tipo, true
FROM tmp_unidades t
WHERE NOT EXISTS (SELECT 1 FROM public.unidades u WHERE u.denominacion = t.denominacion)
ON CONFLICT (codigo) DO UPDATE SET tipo = EXCLUDED.tipo;

-- El 'Cuartel General' del seed base no tenía tipo.
UPDATE public.unidades SET tipo = 'Unidad' WHERE codigo = 'CG' AND tipo IS NULL;

-- 2. Historial de destinos. Cada funcionario tiene a lo sumo un destino
--    abierto (fecha_fin NULL): es lo que exige uix_destinos_persona_activa.
INSERT INTO public.destinos
  (persona_id, unidad_id, fecha_inicio, fecha_fin, posicion_destino, numero_orden, boletin, observaciones)
SELECT per.id, uni.id, v.fecha_inicio::date, v.fecha_fin::date, v.cargo, v.orden, v.boletin, v.obs
FROM (VALUES
  -- Martín González (en actividad desde 2012): pase por número de orden.
  ('41234567', 'BAI',   '2012-02-01', '2024-04-29', 'Oficial de Operaciones',      'O.D. 10859', NULL,          NULL),
  ('41234567', 'EMGFA', '2024-04-30', NULL,         'Sub-Jefe de Personal A-1',    'O.D. 11760', NULL,          'Comisión en la ECEMA'),
  -- Diego Rodríguez (en actividad desde 2008): pase por boletín.
  ('43456789', 'BAII',  '2010-06-01', '2022-06-14', 'Auxiliar de Abastecimiento',  NULL,         'BOL-2010-04', NULL),
  ('43456789', 'BAI',   '2022-06-15', NULL,         'Encargado de Abastecimiento', NULL,         'BOL-2022-11', NULL),
  -- Lucía Fernández (situación Retiro): historial cerrado y ningún destino
  -- vigente, para tener en la grilla el caso `destino: null`.
  ('42345678', 'COA',   '2016-03-01', '2023-12-31', 'Auxiliar Administrativa',     'O.D. 11007', NULL,          'Pasa a situación de retiro')
) AS v(cedula, codigo_unidad, fecha_inicio, fecha_fin, cargo, orden, boletin, obs)
JOIN public.personas per ON per.cedula = v.cedula
JOIN public.unidades uni ON uni.codigo = v.codigo_unidad
WHERE NOT EXISTS (
  SELECT 1 FROM public.destinos a
  WHERE a.persona_id = per.id
    AND a.unidad_id = uni.id
    AND a.fecha_inicio = v.fecha_inicio::date
);

-- 3. El destino vigente manda: la relación laboral vigente apunta a esa unidad.
--    La relación vigente es la que no tiene fecha de fin, no la que tiene
--    estado 'activo': hay relaciones abiertas con otro estado (por ejemplo con
--    situación Retiro) y el listado de personal las muestra igual.
UPDATE public.relaciones_laborales rl
SET unidad_id = a.unidad_id
FROM public.destinos a
WHERE a.persona_id = rl.persona_id
  AND a.fecha_fin IS NULL
  AND a.unidad_id IS NOT NULL
  AND rl.fecha_fin IS NULL;

COMMIT;

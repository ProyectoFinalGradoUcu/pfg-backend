-- SEED DEL MÓDULO DE RETIROS

-- Catálogos que el módulo necesita y que hasta ahora solo cargaba seed_demo.sql, que no
-- corre sobre bases que ya existen: sin ellos POST /retiros falla con "Tipo de movimiento
-- 'Baja' no encontrado en el catálogo" y GET /catalogos/motivos-baja responde vacío.

-- Las dos tablas son del grupo de liquidaciones, así que solo insertamos filas, con los
-- mismos ids, códigos y denominaciones que su schema de producción (db-init.sql).

BEGIN;

-- Motivos de baja

INSERT INTO public.motivos_baja (id, codigo, denominacion)
SELECT CASE WHEN (SELECT count(*) FROM motivos_baja) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.motivos_baja', 'id')) END,
       v.codigo, v.denominacion
FROM (VALUES
  (1, 'RETIRO_OBL', 'Baja por retiro obligatorio.'),
  (2, 'RETIRO_VOL', 'Baja por retiro voluntario.'),
  (3, 'BAJA_DEFINITIVA', 'Baja definitiva.'),
  (4, 'FALLECIMIENTO', 'Baja por fallecimiento.'),
  (5, 'MALA_CONDUCTA', 'Recisión por mala conducta.'),
  (6, 'TERMINO_CONTRATO', 'Baja por término de contrato.'),
  (7, 'INCAPACIDAD', 'Baja por incapacidad.'),
  (8, 'CESE', 'Baja por cese.'),
  (9, 'DESTITUCION', 'Baja por destitución.'),
  (10, 'ESPECIAL_CADETE', 'Baja especial MDN ( baja por ser alta como cadete).'),
  (11, 'ESPECIAL_APRENDIZ', 'Baja especial MDN ( baja por ser alta como aprendiz).')
) AS v(id, codigo, denominacion)
WHERE NOT EXISTS (SELECT 1 FROM motivos_baja x WHERE x.codigo = v.codigo);
SELECT setval(pg_get_serial_sequence('public.motivos_baja', 'id'), GREATEST((SELECT max(id) FROM motivos_baja), 1));

-- Tipos de movimiento: el cierre de carrera elige 'Retiro' o 'Baja' según el motivo

INSERT INTO public.tipos_movimiento (id, nombre, es_alta)
SELECT CASE WHEN (SELECT count(*) FROM tipos_movimiento) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.tipos_movimiento', 'id')) END,
       v.nombre, v.es_alta
FROM (VALUES
  (1, 'Alta por ingreso.', true),
  (2, 'Alta reserva.', true),
  (3, 'Alta por Ascenso', true),
  (4, 'Pase', true),
  (5, 'Reincorporacion', true),
  (6, 'Reintegro', true),
  (7, 'Baja', false),
  (8, 'Retiro', false),
  (9, 'Baja por Ascenso', false),
  (10, 'Ascenso', false),
  (11, 'Cambio de Situacion', false),
  (12, 'Licencia Sin Goce', false)
) AS v(id, nombre, es_alta)
WHERE NOT EXISTS (SELECT 1 FROM tipos_movimiento x WHERE x.nombre = v.nombre);
SELECT setval(pg_get_serial_sequence('public.tipos_movimiento', 'id'), GREATEST((SELECT max(id) FROM tipos_movimiento), 1));

-- Códigos legacy: los sembró el seed_demo viejo, antes de que el catálogo se alineara con
-- el de liquidaciones. Conviven con sus equivalentes nuevos y ensucian el desplegable, y
-- ninguno entra en MOTIVOS_DE_RETIRO, así que un retiro con uno de ellos se registraba como
-- movimiento 'Baja' en vez de 'Retiro'. Se dan de baja en vez de borrarse: hay filas
-- historicas que los referencian.

UPDATE public.motivos_baja
SET vigente = false
WHERE codigo IN ('BSOLIC', 'RETOBL', 'RETOLD', 'FALLED')
  AND vigente;

COMMIT;

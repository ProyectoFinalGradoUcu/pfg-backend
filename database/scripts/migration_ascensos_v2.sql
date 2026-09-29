-- Ascensos v2: antigüedad de servicio deja de ser un requisito "de curso"
--
-- El requisito ANTIGUEDAD_SERVICIO reusaba parametros (JSONB) para guardar
-- anios_minimos, el mismo lugar genérico que iba a parar cualquier otra cosa.
-- Se promueve a una columna tipada propia: el motor ya la puede leer sin
-- adivinar la forma del JSON, y queda validable en el DTO.
--
-- No hay backfill: no hay filas ANTIGUEDAD_SERVICIO cargadas hoy (ver
-- seed_ascensos.sql). Si algún ambiente ya tiene alguna, queda en NULL hasta
-- que se complete a mano — no se asume un valor.

BEGIN;

ALTER TABLE public.ascensos_reglas_requisitos
  ADD COLUMN IF NOT EXISTS anios_antiguedad SMALLINT;

COMMIT;

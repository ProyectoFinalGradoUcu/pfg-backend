-- ─── Destinos por sub-unidad ────────────────────────────────────────────────
--
-- En liquidación la unidad es el comando (C.A.O., C.A.P., C.A.L., C.G.) y el
-- lugar donde revista el funcionario (B.A.I., E.M.A., ...) es la sub-unidad.
-- El destino pasa a guardar la sub-unidad; `unidad_id` se sigue guardando y es
-- siempre el comando de esa sub-unidad, igual que en relaciones_laborales.
--
-- `destinos` es tabla nuestra: no se toca nada de liquidación.
-- Idempotente.

BEGIN;

ALTER TABLE public.destinos
  ADD COLUMN IF NOT EXISTS sub_unidad_id BIGINT REFERENCES public.sub_unidades(id);

CREATE INDEX IF NOT EXISTS idx_destinos_sub_unidad
  ON public.destinos (sub_unidad_id);

-- Backfill: un destino vigente sin sub-unidad toma la de la relación laboral
-- abierta del funcionario, si está en el mismo comando. Los históricos quedan
-- sin sub-unidad: no hay de dónde saber en cuál estuvieron.
UPDATE public.destinos d
SET sub_unidad_id = rl.sub_unidad_id
FROM public.relaciones_laborales rl
JOIN public.sub_unidades su ON su.id = rl.sub_unidad_id
WHERE d.sub_unidad_id IS NULL
  AND d.fecha_fin IS NULL
  AND rl.persona_id = d.persona_id
  AND rl.fecha_fin IS NULL
  AND su.unidad_id = d.unidad_id;

COMMIT;

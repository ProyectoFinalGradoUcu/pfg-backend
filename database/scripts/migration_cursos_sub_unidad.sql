-- ─── Cursos por base ───────────────────────────────────────────────────────
--
-- Un curso de unidad pasa a ser de una base (sub-unidad: B.A.I., E.T.A., ...).
-- Lo ve y lo gestiona quien tiene esa base. `unidad_id` se sigue guardando y es
-- siempre el comando de la base, igual que en destinos y relaciones_laborales.
-- Los cursos generales (sin unidad ni base) no cambian.
--
-- Backfill: un curso de comando pasa a la única base de ese comando. Si el
-- comando tiene varias, queda sin base y solo lo ve el alcance global, que lo
-- tiene que asignar a una base. `cursos` es tabla nuestra.
-- Idempotente.

BEGIN;

ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS sub_unidad_id BIGINT REFERENCES public.sub_unidades(id);

CREATE INDEX IF NOT EXISTS idx_cursos_sub_unidad
  ON public.cursos (sub_unidad_id);

UPDATE public.cursos c
SET sub_unidad_id = su.id
FROM public.sub_unidades su
WHERE c.sub_unidad_id IS NULL
  AND c.unidad_id IS NOT NULL
  AND su.unidad_id = c.unidad_id
  AND (SELECT count(*) FROM public.sub_unidades x WHERE x.unidad_id = c.unidad_id) = 1;

COMMIT;

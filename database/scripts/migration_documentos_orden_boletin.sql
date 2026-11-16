-- Documento de la orden y del boletín en destinos, misiones, ascensos y cursos, guardados en `archivos` (MinIO).
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.

BEGIN;

ALTER TABLE public.destinos
  ADD COLUMN IF NOT EXISTS archivo_orden_id   BIGINT REFERENCES public.archivos(id),
  ADD COLUMN IF NOT EXISTS archivo_boletin_id BIGINT REFERENCES public.archivos(id);

ALTER TABLE public.convocatorias
  ADD COLUMN IF NOT EXISTS archivo_orden_id   BIGINT REFERENCES public.archivos(id),
  ADD COLUMN IF NOT EXISTS archivo_boletin_id BIGINT REFERENCES public.archivos(id);

ALTER TABLE public.funcionarios_convocatorias
  ADD COLUMN IF NOT EXISTS archivo_orden_id   BIGINT REFERENCES public.archivos(id),
  ADD COLUMN IF NOT EXISTS archivo_boletin_id BIGINT REFERENCES public.archivos(id);

ALTER TABLE public.ascensos_ordenes
  ADD COLUMN IF NOT EXISTS archivo_orden_id   BIGINT REFERENCES public.archivos(id),
  ADD COLUMN IF NOT EXISTS archivo_boletin_id BIGINT REFERENCES public.archivos(id);

ALTER TABLE public.funcionarios_cursos
  ADD COLUMN IF NOT EXISTS archivo_orden_id   BIGINT REFERENCES public.archivos(id),
  ADD COLUMN IF NOT EXISTS archivo_boletin_id BIGINT REFERENCES public.archivos(id);

COMMIT;

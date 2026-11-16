-- Foto del funcionario, guardada en `archivos` (MinIO).
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.

BEGIN;

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS foto_archivo_id BIGINT REFERENCES public.archivos(id);

COMMIT;

-- Documento de la orden y del boletín de cada retiro, guardados en `archivos` (MinIO).
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.

BEGIN;

ALTER TABLE public.retiros
  ADD COLUMN IF NOT EXISTS archivo_orden_id   BIGINT REFERENCES public.archivos(id),
  ADD COLUMN IF NOT EXISTS archivo_boletin_id BIGINT REFERENCES public.archivos(id);

COMMIT;

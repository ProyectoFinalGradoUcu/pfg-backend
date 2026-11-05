-- Comisiones importadas de los Access de la FAU: casi nunca traen fecha ni orden o boletín.
-- Se guardan ligadas al período laboral en que estaban anotadas, con el texto original, y la
-- FAU las completa después. Las que se cargan desde la aplicación siguen exigiendo todo.
BEGIN;

ALTER TABLE public.asignaciones_comision
  ADD COLUMN IF NOT EXISTS importada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relacion_laboral_id BIGINT REFERENCES public.relaciones_laborales(id),
  ADD COLUMN IF NOT EXISTS texto_original TEXT;

ALTER TABLE public.asignaciones_comision ALTER COLUMN fecha_inicio DROP NOT NULL;

ALTER TABLE public.asignaciones_comision DROP CONSTRAINT IF EXISTS asignaciones_comision_fechas;
ALTER TABLE public.asignaciones_comision ADD CONSTRAINT asignaciones_comision_fechas
  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio);

ALTER TABLE public.asignaciones_comision DROP CONSTRAINT IF EXISTS asignaciones_comision_inicio;
ALTER TABLE public.asignaciones_comision ADD CONSTRAINT asignaciones_comision_inicio
  CHECK (importada OR fecha_inicio IS NOT NULL);

ALTER TABLE public.asignaciones_comision DROP CONSTRAINT IF EXISTS asignaciones_comision_documento;
ALTER TABLE public.asignaciones_comision ADD CONSTRAINT asignaciones_comision_documento CHECK (
  importada OR coalesce(length(btrim(numero_orden)), 0) > 0 OR coalesce(length(btrim(boletin)), 0) > 0
);

-- Una importada sin fecha de fin no está necesariamente abierta: la vigencia la da su período.
DROP INDEX IF EXISTS public.uix_asignaciones_comision_abierta;
CREATE UNIQUE INDEX uix_asignaciones_comision_abierta
  ON public.asignaciones_comision(persona_id, comision_id) WHERE fecha_fin IS NULL AND NOT importada;
CREATE INDEX IF NOT EXISTS idx_asignaciones_comision_relacion ON public.asignaciones_comision(relacion_laboral_id);

COMMIT;

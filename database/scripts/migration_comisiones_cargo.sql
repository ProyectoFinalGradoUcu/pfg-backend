-- El cargo pertenece a la persona dentro de una comisión, no al catálogo.
BEGIN;
ALTER TABLE public.asignaciones_comision
  ADD COLUMN IF NOT EXISTS cargo VARCHAR(200);
COMMIT;

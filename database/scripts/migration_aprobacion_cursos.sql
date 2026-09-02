BEGIN;

ALTER TABLE public.funcionarios_cursos
  ADD COLUMN IF NOT EXISTS aprobado BOOLEAN,
  ADD COLUMN IF NOT EXISTS observacion_calificacion TEXT;

ALTER TABLE public.funcionarios_modulos_curso
  ADD COLUMN IF NOT EXISTS aprobado BOOLEAN,
  ADD COLUMN IF NOT EXISTS observacion_calificacion TEXT;

COMMIT;

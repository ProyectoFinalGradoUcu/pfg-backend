-- No fusionar cursos ni alterar antecedentes si una base existente tiene duplicados.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cursos WHERE nombre_curso IS NOT NULL GROUP BY lower(btrim(nombre_curso)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay cursos con nombres duplicados ignorando mayúsculas/espacios. Corregirlos antes de aplicar migration_cursos_nombre_unico.sql';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uix_cursos_nombre_normalizado ON cursos (lower(btrim(nombre_curso)));
COMMIT;

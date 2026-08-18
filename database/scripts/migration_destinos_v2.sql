-- ─── Destinos v2: el destino es la asignación de un funcionario a una unidad ──
--
-- Antes:  destinos                 = catálogo propio de lugares (duplicaba `unidades`)
--         asignaciones_funcionario = la asignación persona ↔ lugar
--
-- Ahora:  unidades = el lugar ('Cuartel General')
--         destinos = "José Pérez está o estuvo en esa unidad"
--
-- El catálogo duplicado se borra y sus filas se migran a `unidades`. La tabla de
-- asignaciones NO se mueve: se renombra a `destinos`, que es lo que realmente
-- contiene. Además gana orden y boletín propios, igual que
-- funcionarios_convocatorias en misiones.

BEGIN;

-- 1. `unidades` absorbe el tipo que vivía en destinos.tipo_destino
--    ('Unidad' vs 'Organismo': E.M.G.F.A. no es una unidad).
ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(100);

-- 2. Migración del catálogo viejo y renombrado de la tabla de asignaciones.
DO $$
BEGIN
  IF to_regclass('public.asignaciones_funcionario') IS NOT NULL THEN

    ALTER TABLE public.asignaciones_funcionario
      ADD COLUMN IF NOT EXISTS unidad_id    BIGINT REFERENCES public.unidades(id),
      ADD COLUMN IF NOT EXISTS numero_orden VARCHAR(50),
      ADD COLUMN IF NOT EXISTS boletin      VARCHAR(50);

    IF to_regclass('public.destinos') IS NOT NULL THEN

      -- 2a. El catálogo viejo pasa a `unidades`. El código se deriva del id
      --     original para garantizar unicidad sin depender del texto; el seed
      --     de destinos les pone después el código definitivo (COA, BAI, ...).
      INSERT INTO public.unidades (codigo, denominacion, tipo, vigente)
      SELECT 'DEST-' || d.id,
             LEFT(COALESCE(d.ubicacion, 'Destino ' || d.id), 150),
             d.tipo_destino,
             true
      FROM public.destinos d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.unidades u
        WHERE u.denominacion = LEFT(COALESCE(d.ubicacion, 'Destino ' || d.id), 150)
      )
      ON CONFLICT (codigo) DO NOTHING;

      -- 2b. Reapuntar las asignaciones a la unidad equivalente.
      UPDATE public.asignaciones_funcionario a
      SET unidad_id = u.id
      FROM public.destinos d
      JOIN public.unidades u
        ON u.denominacion = LEFT(COALESCE(d.ubicacion, 'Destino ' || d.id), 150)
      WHERE a.destino_id = d.id
        AND a.unidad_id IS NULL;

      -- 2c. La orden pasa del lugar a la asignación: en el modelo nuevo la orden
      --     es la que destina a la persona, no la que creó la unidad.
      UPDATE public.asignaciones_funcionario a
      SET numero_orden = d.numero_orden
      FROM public.destinos d
      WHERE a.destino_id = d.id
        AND a.numero_orden IS NULL;

      ALTER TABLE public.asignaciones_funcionario DROP COLUMN IF EXISTS destino_id;
      DROP TABLE public.destinos;
    END IF;

    -- 2d. Ahora que el nombre quedó libre, la tabla de asignaciones se llama
    --     como lo que guarda. No se mueve ni una fila.
    ALTER TABLE public.asignaciones_funcionario RENAME TO destinos;
    ALTER SEQUENCE IF EXISTS public.asignaciones_funcionario_id_seq RENAME TO destinos_id_seq;
    ALTER INDEX    IF EXISTS public.asignaciones_funcionario_pkey   RENAME TO destinos_pkey;
  END IF;
END $$;

-- 2e. Las FK conservan el nombre viejo tras el RENAME. Se renombran para que
--     `\d destinos` no siga mostrando el nombre de una tabla que ya no existe.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.destinos'::regclass
      AND conname LIKE 'asignaciones_funcionario%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.destinos RENAME CONSTRAINT %I TO %I',
      c.conname,
      replace(c.conname, 'asignaciones_funcionario', 'destinos')
    );
  END LOOP;
END $$;

-- 3. Idempotencia: si la tabla ya se llamaba `destinos`, garantizar las columnas.
ALTER TABLE public.destinos
  ADD COLUMN IF NOT EXISTS unidad_id    BIGINT REFERENCES public.unidades(id),
  ADD COLUMN IF NOT EXISTS numero_orden VARCHAR(50),
  ADD COLUMN IF NOT EXISTS boletin      VARCHAR(50);

-- 4. Índices. Se limpian los nombres viejos por si quedó una corrida anterior.
DROP INDEX IF EXISTS public.uix_asignaciones_persona_activa;
DROP INDEX IF EXISTS public.idx_asignaciones_unidad;

-- Un solo destino activo por funcionario. Las asignaciones cerradas
-- (fecha_fin NOT NULL) quedan fuera del índice: son el historial.
CREATE UNIQUE INDEX IF NOT EXISTS uix_destinos_persona_activa
  ON public.destinos (persona_id)
  WHERE fecha_fin IS NULL;

CREATE INDEX IF NOT EXISTS idx_destinos_unidad
  ON public.destinos (unidad_id);

COMMIT;

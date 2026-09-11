-- Retiros v2: de 1:1 a historial 1:N 
--
-- El UNIQUE sobre persona_id impedía guardar más de un retiro por funcionario, así que no
-- había historial posible: una reincorporación seguida de un segundo retiro no
-- entraba en el modelo. Además la tabla gana el motivo tipificado, la autoría, y
-- lo que hace falta para revertir un retiro sin adivinar: el movimiento laboral
-- que creó y los cierres que aplicó.
--

BEGIN;

ALTER TABLE public.retiros
  ADD COLUMN IF NOT EXISTS relacion_laboral_id   BIGINT REFERENCES public.relaciones_laborales(id),
  ADD COLUMN IF NOT EXISTS motivo_baja_id        BIGINT REFERENCES public.motivos_baja(id),
  ADD COLUMN IF NOT EXISTS numero_orden          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS boletin               VARCHAR(50),
  ADD COLUMN IF NOT EXISTS observaciones         TEXT,
  ADD COLUMN IF NOT EXISTS movimiento_laboral_id BIGINT REFERENCES public.movimientos_laborales(id),
  ADD COLUMN IF NOT EXISTS cierres_aplicados     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS registrado_por        BIGINT REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS registrado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS anulado               BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_anulacion      TEXT,
  ADD COLUMN IF NOT EXISTS fecha_anulacion       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anulado_por           BIGINT REFERENCES public.usuarios(id);

-- Backfill de las filas que ya existían la relación laboral más reciente de la persona es la que ese retiro cerró.

UPDATE public.retiros r
SET relacion_laboral_id = (
  SELECT rl.id FROM public.relaciones_laborales rl
  WHERE rl.persona_id = r.persona_id
  ORDER BY rl.fecha_inicio DESC
  LIMIT 1
)
WHERE r.relacion_laboral_id IS NULL;

UPDATE public.retiros
SET motivo_baja_id = (SELECT id FROM public.motivos_baja WHERE codigo = 'RETIRO_OBL')
WHERE motivo_baja_id IS NULL;

UPDATE public.retiros SET fecha_retiro = CURRENT_DATE WHERE fecha_retiro IS NULL;

-- Si algo quedó sin completar, abortar en vez de borrar datos en silencio.
DO $$
DECLARE incompletos INT;
BEGIN
    SELECT count(*) INTO incompletos
    FROM public.retiros
    WHERE relacion_laboral_id IS NULL OR motivo_baja_id IS NULL OR persona_id IS NULL;

    IF incompletos > 0 THEN
        RAISE EXCEPTION
            'No se puede imponer NOT NULL: % retiro(s) sin relación laboral, motivo o persona. Revisalos a mano.',
            incompletos;
    END IF;
END $$;

ALTER TABLE public.retiros
  ALTER COLUMN persona_id          SET NOT NULL,
  ALTER COLUMN relacion_laboral_id SET NOT NULL,
  ALTER COLUMN fecha_retiro        SET NOT NULL,
  ALTER COLUMN motivo_baja_id      SET NOT NULL;

-- El UNIQUE es lo que impedía el historial.
ALTER TABLE public.retiros DROP CONSTRAINT IF EXISTS retiros_persona_id_key;

CREATE INDEX IF NOT EXISTS idx_retiros_persona ON public.retiros(persona_id);
CREATE INDEX IF NOT EXISTS idx_retiros_fecha   ON public.retiros(fecha_retiro);

COMMIT;

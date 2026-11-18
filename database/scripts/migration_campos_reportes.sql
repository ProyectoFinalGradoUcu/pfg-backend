-- Campos aprobados para reportes y fichas (decision 20/10/2026)
--
-- personas: credencial civica (ficha personal / legajo del oficial) y nivel de
--           idoneidad 3/5/7/9 (nivel de pericia del personal subalterno).
-- destinos: numero de destino (Des Num), fecha de la orden, fecha de boletin y
--           numero/fecha de resolucion, tal como se cargan en el modal de destino.
-- misiones: fecha de orden y de boletin, numero/fecha de resolucion y resolucion
--           CJE sobre el catalogo de misiones.
-- tipos_movimiento: marca (ej. 530) usada por el reporte de movimientos por unidad.
-- relaciones_laborales: codigos legajo (-1-4-7-8-) del legajo del oficial.
--
-- Todo opcional (NULL) porque el dato viene de la carga de la unidad, no de la base.

BEGIN;

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS credencial_civica VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nivel_idoneidad   SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personas_nivel_idoneidad_check') THEN
    ALTER TABLE public.personas
      ADD CONSTRAINT personas_nivel_idoneidad_check
      CHECK (nivel_idoneidad IS NULL OR nivel_idoneidad IN (3, 5, 7, 9));
  END IF;
END $$;

ALTER TABLE public.destinos
  ADD COLUMN IF NOT EXISTS numero_destino    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS fecha_orden       DATE,
  ADD COLUMN IF NOT EXISTS fecha_boletin     DATE,
  ADD COLUMN IF NOT EXISTS numero_resolucion VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fecha_resolucion  DATE;

ALTER TABLE public.misiones
  ADD COLUMN IF NOT EXISTS fecha_orden       DATE,
  ADD COLUMN IF NOT EXISTS fecha_boletin     DATE,
  ADD COLUMN IF NOT EXISTS numero_resolucion VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fecha_resolucion  DATE,
  ADD COLUMN IF NOT EXISTS resolucion_cje    VARCHAR(50);

ALTER TABLE public.tipos_movimiento
  ADD COLUMN IF NOT EXISTS marca VARCHAR(10);

ALTER TABLE public.relaciones_laborales
  ADD COLUMN IF NOT EXISTS codigos_legajo VARCHAR(20);

COMMIT;

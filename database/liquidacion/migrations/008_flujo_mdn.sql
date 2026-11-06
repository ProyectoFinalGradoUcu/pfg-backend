-- ============================================================
-- Migración 008: Flujo MDN completo (consolidada)
-- Fecha: 2026-07-08
-- Descripción:
--   Consolida todo lo relacionado al flujo de MDN y descuentos
--   personales que estaba repartido entre migraciones 007, 008,
--   009 y 011 :
--     1. Agregar columnas MDN/descuentos a periodos_liquidacion
--     2. Agrandar columna estado a varchar(30) para soportar
--        'DESCUENTOS_PERSONALES' (22 caracteres)
--     3. Renombrar estados antiguos (LISTA_CALCULO→LISTO_P_CALCULO,
--        CALCULADA→CALCULADO) y actualizar CHECK constraint
--        con todos los estados válidos del flujo.
--     4. Insertar acciones de auditoría del flujo MDN.
--
--   Idempotente: puede correrse varias veces sin efectos
--   colaterales gracias a IF NOT EXISTS / ON CONFLICT.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('008', 'flujo_mdn') THEN
        RAISE NOTICE 'Migración 008 ya ejecutada, saltando.';
        RETURN;
    END IF;

    -- ── 1. Columnas MDN / descuentos personales ──────────────────────
    ALTER TABLE public.periodos_liquidacion
        ADD COLUMN IF NOT EXISTS fecha_envio_mdn TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS usuario_envio_mdn BIGINT NULL
            REFERENCES public.usuarios(id),
        ADD COLUMN IF NOT EXISTS fecha_descuentos_personales TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS usuario_descuentos_personales BIGINT NULL
            REFERENCES public.usuarios(id);

    COMMENT ON COLUMN public.periodos_liquidacion.fecha_envio_mdn
        IS 'Fecha en que se envió la liquidación al MDN';
    COMMENT ON COLUMN public.periodos_liquidacion.usuario_envio_mdn
        IS 'Usuario que ejecutó el envío al MDN';
    COMMENT ON COLUMN public.periodos_liquidacion.fecha_descuentos_personales
        IS 'Fecha en que se aplicaron los descuentos personales post-MDN';
    COMMENT ON COLUMN public.periodos_liquidacion.usuario_descuentos_personales
        IS 'Usuario que aplicó los descuentos personales';

    -- ── 2. Agrandar columna estado (la 011 anterior) ────────────────
    ALTER TABLE public.periodos_liquidacion
        ALTER COLUMN estado TYPE character varying(30);

    -- ── 3. Actualizar registros con estados antiguos ─────────────────
    UPDATE public.periodos_liquidacion
        SET estado = 'LISTO_P_CALCULO'
        WHERE estado = 'LISTA_CALCULO';

    UPDATE public.periodos_liquidacion
        SET estado = 'CALCULADO'
        WHERE estado = 'CALCULADA';

    -- ── 4. Recrear CHECK constraint con estados del flujo MDN ─────
    ALTER TABLE public.periodos_liquidacion
        DROP CONSTRAINT IF EXISTS periodos_liquidacion_estado_check;

    ALTER TABLE public.periodos_liquidacion
        ADD CONSTRAINT periodos_liquidacion_estado_check
        CHECK (estado IN (
            'ABIERTA',
            'LISTO_P_CALCULO',
            'EN_CALCULO',
            'CALCULADO',
            'PARA_MDN',
            'DESCUENTOS_PERSONALES',
            'CERRADA'
        ));

    -- ── 5. Acciones de auditoría del flujo MDN ─────────────────────
    INSERT INTO public.acciones (nombre, descripcion)
    VALUES
        ('EnviarAMDN', 'Enviar período de liquidación a MDN'),
        ('AplicarDescuentosPersonalesPeriodo', 'Aplicar descuentos personales post-MDN'),
        ('ReabrirDesdeParaMDN', 'Reabrir período desde estado PARA_MDN'),
        ('EliminarPeriodo', 'Eliminar período de liquidación')
    ON CONFLICT (nombre) DO NOTHING;

    PERFORM marcar_migracion_exitosa('008');
END;
$$;

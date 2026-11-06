-- ============================================================
-- Migración: Eliminar tipo de compensación FRONTERA
--            (Compensación Fronteriza)
--
-- PLAN_FRONTERA (042.573) no se toca.
--
-- Orden de borrado respeta FKs sin CASCADE:
--   1. items_lote_compensacion  (via lotes)
--   2. lotes_compensacion
--   3. config_compensaciones
--   4. tipos_compensacion
-- ============================================================

DO $$
DECLARE
    v_tipo_id BIGINT;
BEGIN
    IF NOT registrar_migracion('20260706000000', 'eliminar_tipo_frontera') THEN
        RAISE NOTICE 'Migración 20260706000000 ya ejecutada, saltando.';
        RETURN;
    END IF;

    SELECT id INTO v_tipo_id
    FROM tipos_compensacion
    WHERE codigo = 'FRONTERA';

    IF v_tipo_id IS NULL THEN
        RAISE NOTICE 'Tipo FRONTERA no encontrado, nada que eliminar.';
        PERFORM marcar_migracion_exitosa('20260706000000');
        RETURN;
    END IF;

    -- 1. Items de lotes
    DELETE FROM items_lote_compensacion
    WHERE lote_compensacion_id IN (
        SELECT id FROM lotes_compensacion WHERE tipo_compensacion_id = v_tipo_id
    );

    -- 2. Lotes
    DELETE FROM lotes_compensacion
    WHERE tipo_compensacion_id = v_tipo_id;

    -- 3. Configuraciones
    DELETE FROM config_compensaciones
    WHERE tipo_compensacion_id = v_tipo_id;

    -- 4. Tipo
    DELETE FROM tipos_compensacion
    WHERE id = v_tipo_id;

    RAISE NOTICE 'Tipo FRONTERA (id=%) eliminado junto con sus configs y lotes.', v_tipo_id;

    PERFORM marcar_migracion_exitosa('20260706000000');
END;
$$;

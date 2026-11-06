-- ============================================================
-- Migración 003: Ajustar configuración de Nocturnidad
--
-- Contexto: el cálculo de nocturnidad funciona con fórmula
-- 'presupuesto' (importa monto calculado desde archivo externo).
--
-- Controles de límites:
--   - tope_unidades = 15 (máximo de días/horas por persona)
--   - valor_maximo  = 322.64 (monto máximo permitido POR DÍA)
--   - tope          = NULL (sin límite total del lote)
--
-- Nota: el campo `tope` representa la suma total del lote,
-- NO el monto por día. El monto máximo por unidad va en
-- `valor_maximo`.
--
-- Aplica a configs activas de NOCTURNIDAD para ambos regímenes.
-- ============================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NOT registrar_migracion('003', 'ajustar_config_nocturnidad') THEN
        RAISE NOTICE 'Migración 003 ya ejecutada, saltando.';
        RETURN;
    END IF;

    UPDATE config_compensaciones
    SET formula         = 'presupuesto',
        unidad_medida   = 'hora',
        valor_por_unidad = NULL,
        tope            = NULL,
        tope_unidades   = 15,
        valor_maximo    = 322.64
    WHERE tipo_compensacion_id IN (
        SELECT id FROM tipos_compensacion WHERE codigo = 'NOCTURNIDAD'
    )
    AND activo = true;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Configs de NOCTURNIDAD actualizadas: %', v_count;

    -- Crear escalafón SIN_ESCALAFON para cadetes/aspirantes que no tienen escalafón
    INSERT INTO escalafones (codigo, denominacion, vigente)
    VALUES ('SIN_ESCALAFON', 'Sin Escalafón', true)
    ON CONFLICT (codigo) DO NOTHING;

    PERFORM marcar_migracion_exitosa('003');
END;
$$;
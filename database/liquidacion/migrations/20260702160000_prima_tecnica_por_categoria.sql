-- ============================================================
-- Migración: Prima Técnica (042.092) pasa a calcularse por
-- CATEGORÍA (A/B/C) del funcionario, no por grado.
--
-- Problema encontrado al comparar recibo generado vs recibo de referencia
-- (Zapata López, Cbo. 2ª, mayo 2026): remuneraciones_grado tenía el mismo
-- monto (912.10) duplicado en Sdo.1ra/Cbo.2da/Cbo.1ra, y el recibo real
-- mostraba $1.520,16 para Cbo.2da. Investigando el legacy (SUM33107.PRG)
-- se confirmó que Prima Técnica NUNCA fue un monto por grado: depende de
-- la clasificación individual del funcionario (Personal.Prima_Tec = A/B/C,
-- asignada por Orden del Comando), con un monto propio por categoría
-- (PrimA_CA/PrimB_CA/PrimC_CA en el legacy).
--
-- Valores confirmados (recibo real + tabla de referencia):
--   A = 3040.33 | B = 1520.16 | C = 912.10
--
-- Se usa tarifas_por_categoria (ya existente, usada hoy para ASID_VUELO/SAR)
-- en vez de crear una tabla nueva. Las filas de remuneraciones_grado para
-- 042.092 quedan expiradas (vigente_hasta) porque ya no se consultan para
-- este ítem — CalculadorHaberesBase.AgregarItemsCondicionales ahora resuelve
-- el monto vía InsumosPeriodo.ObtenerTarifaCategoria(categoria, 42092).
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('20260702160000', 'prima_tecnica_por_categoria') THEN
        RAISE NOTICE 'Migración 20260702160000 ya ejecutada, saltando.';
        RETURN;
    END IF;

    -- Tarifas por categoría para Prima Técnica (042.092)
    INSERT INTO tarifas_por_categoria (item_id, categoria, monto, tipo_monto, vigente_desde)
    SELECT ci.id, v.categoria, v.monto, 'mensual', DATE '2026-01-01'
    FROM catalogo_items ci
    CROSS JOIN (VALUES ('A', 3040.33), ('B', 1520.16), ('C', 912.10)) AS v(categoria, monto)
    WHERE ci.codigo = 42092
      AND NOT EXISTS (
          SELECT 1 FROM tarifas_por_categoria t
          WHERE t.item_id = ci.id AND t.categoria = v.categoria AND t.vigente_desde = DATE '2026-01-01'
      );

    -- Expirar las filas de remuneraciones_grado para 042.092: ya no se usan
    -- (quedaban mal cargadas — mismo monto duplicado entre grados distintos).
    UPDATE remuneraciones_grado rg
    SET vigente_hasta = DATE '2025-12-31'
    FROM catalogo_items ci
    WHERE ci.id = rg.item_id
      AND ci.codigo = 42092
      AND rg.vigente_hasta IS NULL;

    RAISE NOTICE 'tarifas_por_categoria cargada para 042.092 (A/B/C); remuneraciones_grado de 042.092 expirada';

    PERFORM marcar_migracion_exitosa('20260702160000');
END;
$$;

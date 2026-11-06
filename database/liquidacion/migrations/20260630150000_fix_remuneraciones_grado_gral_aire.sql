-- ============================================================
-- Migración: Corregir remuneraciones_grado para Gral. Del Aire (grado_id=15)
--
-- Problema encontrado al comparar recibo generado vs recibo de referencia:
--   Las filas de remuneraciones_grado para grado_id=15 (Gral. Del Aire) en los
--   códigos 048.015 (AUM.LEY 17.269) y 048.023 (Recup. Salarial 2007) tienen el
--   mismo monto que grado_id=14 (Brig. Gral.) — nunca se cargó el valor propio
--   del grado más alto, quedó duplicado del grado inmediato inferior.
--
--   048.015: 5,421.85 (= grado 14) → debería ser 6,154.74
--   048.023: 1,903.56 (= grado 14) → debería ser 2,188.57
--
--   Como 048.023 entra en la base del SDL (048.012 = wpara53 × 5,3%, ver
--   AgregarItemsDecreto en CalculadorHaberesBase.cs), el error se propaga y
--   además subestima COMPENSACION 5.3% y DEDICACION INTEGRAL (043.004 = wPara10
--   × 50% para Sit10/activo).
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('20260630150000', 'fix_remuneraciones_grado_gral_aire') THEN
        RAISE NOTICE 'Migración 20260630150000 ya ejecutada, saltando.';
        RETURN;
    END IF;

    -- 048.015 — AUM.LEY 17.269
    UPDATE remuneraciones_grado rg
    SET monto = 6154.74
    FROM catalogo_items ci
    WHERE ci.id = rg.item_id
      AND ci.codigo = 48015
      AND rg.grado_id = 15
      AND rg.vigente_hasta IS NULL;

    -- 048.023 — Recup. Salarial 2007 ("Prima (048.023)")
    UPDATE remuneraciones_grado rg
    SET monto = 2188.57
    FROM catalogo_items ci
    WHERE ci.id = rg.item_id
      AND ci.codigo = 48023
      AND rg.grado_id = 15
      AND rg.vigente_hasta IS NULL;

    RAISE NOTICE 'remuneraciones_grado corregido para grado 15 (048.015, 048.023)';

    PERFORM marcar_migracion_exitosa('20260630150000');
END;
$$;

-- ============================================================
-- Migración 20260707130000: Corregir remuneraciones_grado del grado Tte. 2°
-- (PART.LEY 18834 ART y AUM.LEY 17.269)
--
-- Problema: al comparar el recibo generado contra el recibo FoxPro real
-- (Mayo 2026, cédula 40211677) para el grado Tte. 2° (grado_id=8), dos
-- montos de remuneraciones_grado están mal cargados:
--
--   OG 042.536 PART.LEY 18834 ART:  DB = 11,276.79   FoxPro = 8,989.22
--   OG 048.015 AUM.LEY 17.269:      DB =  1,817.69   FoxPro =  1,498.81
--
-- Estos dos ítems se agregan en CalculadorHaberesBase.AgregarItemsDecreto,
-- código compartido por TODOS los calculadores (busca solo por GradoId), por
-- lo que no dependen de la situación del funcionario — la migración
-- 20260707120000 (fix situación reservistas superiores) no los afecta.
-- Confirmado que ambos valores incorrectos no coinciden con los de ningún
-- otro grado de la tabla: es un error de carga puntual para Tte. 2°, no un
-- desplazamiento entre grados.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('20260707130000', 'fix_remuneraciones_tte2do_18834_17269') THEN
        RAISE NOTICE 'Migración 20260707130000 ya ejecutada, saltando.';
        RETURN;
    END IF;

    -- NOTA (agregada en 20260709023000/024500): esta migración es anterior a que
    -- existiera grupo_remuneracion. El filtro "AND rg.grupo_remuneracion IS NULL"
    -- de abajo se agregó para que, si esta migración corre fuera de orden respecto
    -- de 20260709020000 (que agrega filas 'COMANDO'/'SSGG' con estos mismos montos),
    -- nunca pise una fila con grupo — solo debe tocar la fila general.
    --
    -- En una base NUEVA, esta migración corre ANTES que 20260709020000 (por orden
    -- de archivo), así que la columna todavía no existe en ese momento — sin este
    -- ADD COLUMN defensivo, la referencia a rg.grupo_remuneracion de abajo falla
    -- con "column does not exist". Es idempotente: si 20260709020000 ya la creó
    -- (caso de bases existentes que ya venían con la columna), no hace nada.
    ALTER TABLE remuneraciones_grado ADD COLUMN IF NOT EXISTS grupo_remuneracion VARCHAR(20);

    -- OG 042.536 — PART.LEY 18834 ART (Tte. 2°): 11,276.79 → 8,989.22
    UPDATE remuneraciones_grado rg
    SET monto = 8989.22
    FROM catalogo_items ci
    WHERE rg.item_id = ci.id
      AND ci.codigo = 42536
      AND rg.grado_id = 8
      AND rg.monto = 11276.79
      AND rg.grupo_remuneracion IS NULL;

    -- OG 048.015 — AUM.LEY 17.269 (Tte. 2°): 1,817.69 → 1,498.81
    UPDATE remuneraciones_grado rg
    SET monto = 1498.81
    FROM catalogo_items ci
    WHERE rg.item_id = ci.id
      AND ci.codigo = 48015
      AND rg.grado_id = 8
      AND rg.monto = 1817.69
      AND rg.grupo_remuneracion IS NULL;

    PERFORM marcar_migracion_exitosa('20260707130000');
END;
$$;

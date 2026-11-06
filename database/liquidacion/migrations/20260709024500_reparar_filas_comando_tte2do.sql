-- ============================================================
-- Migración 20260709024500: Reparar filas 'COMANDO' de Tte. 2° corrompidas
--
-- Causa: en este ambiente, 20260707130000 (parche anterior a que existiera
-- grupo_remuneracion) se ejecutó DESPUÉS de 20260709020000 (que ya había
-- insertado las filas 'COMANDO'/'SSGG'), fuera del orden normal de archivo.
-- Su UPDATE original filtraba solo por grado_id + monto, sin grupo, así que
-- pisó tanto la fila general (grupo NULL) como la fila 'COMANDO' recién
-- insertada — ambas tenían monto=11.276,79 / 1.817,69 en ese momento.
--
-- 20260709023000 ya corrigió la fila general. Esta migración corrige la fila
-- 'COMANDO', que había quedado en 8.989,22 / 1.498,81 (el valor de SSGG) en
-- vez de 11.276,79 / 1.817,69.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('20260709024500', 'reparar_filas_comando_tte2do') THEN
        RAISE NOTICE 'Migración 20260709024500 ya ejecutada, saltando.';
        RETURN;
    END IF;

    UPDATE remuneraciones_grado rg
    SET monto = 11276.79
    FROM catalogo_items ci, grados g
    WHERE rg.item_id = ci.id AND ci.codigo = 42536
      AND rg.grado_id = g.id AND g.codigo = 'TTE_2DO'
      AND rg.grupo_remuneracion = 'COMANDO'
      AND rg.monto = 8989.22;

    UPDATE remuneraciones_grado rg
    SET monto = 1817.69
    FROM catalogo_items ci, grados g
    WHERE rg.item_id = ci.id AND ci.codigo = 48015
      AND rg.grado_id = g.id AND g.codigo = 'TTE_2DO'
      AND rg.grupo_remuneracion = 'COMANDO'
      AND rg.monto = 1498.81;

    PERFORM marcar_migracion_exitosa('20260709024500');
END;
$$;

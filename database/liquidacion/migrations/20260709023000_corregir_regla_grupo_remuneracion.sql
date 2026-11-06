-- ============================================================
-- Migración 20260709023000: Corregir regla de grupo_remuneracion (Comando/SSGG)
--
-- La migración 20260707130000 había sobreescrito la fila general (sin grupo) de
-- Tte. 2° (grado_id=8) para 042.536/048.015 al valor de "SS.GG. Y Equiparados",
-- asumiendo que ese era el valor "de base". Comparando recibos reales nuevos
-- (cédulas 53764283, 52106008, 43111769 — todas escalafón SG, situación
-- activa) contra el sistema legado, se confirmó que la hipótesis era al revés:
--
--   - Personal en actividad (cualquier escalafón: SG, AV, NAV, ...) usa
--     SIEMPRE Cuerpo Comando.
--   - Solo el reservista superior (situación SIT05, escalafón RVA — cédula
--     40211677) usa SS.GG. Y Equiparados.
--
-- InsumosPeriodoLoader.GrupoPorCodigoEscalafon ya se corrigió (RVA→SSGG, se
-- sacó el mapeo AV/SG). Esta migración corrige el dato: la fila general
-- (grupo_remuneracion IS NULL) de Tte. 2° vuelve a ser el valor de Cuerpo
-- Comando — que es el que corresponde a todo el mundo salvo los RVA, y estos
-- ya resuelven por la fila 'SSGG' explícita agregada en 20260709020000.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('20260709023000', 'corregir_regla_grupo_remuneracion') THEN
        RAISE NOTICE 'Migración 20260709023000 ya ejecutada, saltando.';
        RETURN;
    END IF;

    UPDATE remuneraciones_grado rg
    SET monto = 11276.79
    FROM catalogo_items ci, grados g
    WHERE rg.item_id = ci.id AND ci.codigo = 42536
      AND rg.grado_id = g.id AND g.codigo = 'TTE_2DO'
      AND rg.grupo_remuneracion IS NULL
      AND rg.monto = 8989.22;

    UPDATE remuneraciones_grado rg
    SET monto = 1817.69
    FROM catalogo_items ci, grados g
    WHERE rg.item_id = ci.id AND ci.codigo = 48015
      AND rg.grado_id = g.id AND g.codigo = 'TTE_2DO'
      AND rg.grupo_remuneracion IS NULL
      AND rg.monto = 1498.81;

    PERFORM marcar_migracion_exitosa('20260709023000');
END;
$$;

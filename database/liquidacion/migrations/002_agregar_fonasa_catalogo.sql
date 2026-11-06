-- ============================================================
-- Migración 002: Agregar FONASA al catálogo de ítems
--
-- Problema: el código 521 (FONASA) no existía en catalogo_items,
-- por lo que el descuento de salud para civiles / funcionarios
-- FONASA no tenía entrada de catálogo y se emitía sin metadatos.
--
-- El código 520 (DNS FFAA TRAMO 2) era incorrecto para FONASA.
-- LiquidacionService ahora usa código 521 para FONASA.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('002', 'agregar_fonasa_catalogo') THEN
        RAISE NOTICE 'Migración 002 ya ejecutada, saltando.';
        RETURN;
    END IF;

    PERFORM setval('catalogo_items_id_seq', (SELECT MAX(id) FROM catalogo_items));

    INSERT INTO catalogo_items
        (codigo, nombre, tipo, es_gravado,
         contribuye_w_para_5_3, contribuye_w_para_10, contribuye_w_para_20, contribuye_w_nominal,
         clasificacion_siif, formula_calculo, orden_calculo,
         item_par_ficto_id, norma_legal,
         acumula_aguinaldo, lleva_aumento, vigente)
    VALUES
        (521, 'FONASA', 'descuento_legal', false,
         false, false, false, false,
         '5.020', 'tabla_externa', 0,
         NULL, NULL,
         false, false, true);

    PERFORM marcar_migracion_exitosa('002');
END;
$$;

-- ============================================================
-- Migración 005: Agregar ETA como descuento personal
--
-- Contexto: el Aprendiz (Sit10) de ETA tiene una "Cuota de Ingreso"
-- que en el legacy FoxPro se procesaba en CUOTAING.DBF con código 538.
-- En el nuevo sistema se modela como DescuentoPersonalPeriodo, lo que
-- requiere:
--   A) catalogo_items con tipo='descuento_personal' y código 538
--   B) acreedores con código 'ETA' (Escuela Técnica Aeronáutica)
--
-- Referencia recibo legacy:
--   TOTAL DESC. PERS.: ETA 2,050.00
--
-- TICKET ALIMENTACION (código 618): el catálogo item ya existe (id=213).
-- Su acreedor legacy es MDN (id=48) — el descuento se liquida vía LIQ_MDN.
-- No requiere cambios de catálogo; solo asignar acreedor_id=48 al crear
-- el DescuentoPersonalPeriodo para el funcionario.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('005', 'agregar_eta_descuento_personal') THEN
        RAISE NOTICE 'Migración 005 ya ejecutada, saltando.';
        RETURN;
    END IF;

    -- A) Catalog item para ETA (código legacy 538 — CUOTAING.DBF)
    PERFORM setval('catalogo_items_id_seq', (SELECT MAX(id) FROM catalogo_items));

    INSERT INTO catalogo_items
        (codigo, nombre, tipo, es_gravado,
         contribuye_w_para_5_3, contribuye_w_para_10, contribuye_w_para_20, contribuye_w_nominal,
         clasificacion_siif, formula_calculo, orden_calculo,
         item_par_ficto_id, norma_legal,
         acumula_aguinaldo, lleva_aumento, vigente)
    SELECT
        538, 'ETA', 'descuento_personal', false,
        false, false, false, false,
        'ETA', 'fijo', 0,
        NULL, 'Sistema legado FoxPro CUOTAING.DBF cod.538',
        false, false, true
    WHERE NOT EXISTS (
        SELECT 1 FROM catalogo_items WHERE codigo = 538 AND tipo = 'descuento_personal'
    );

    RAISE NOTICE 'Catálogo ETA (cod.538) verificado/agregado.';

    -- B) Acreedor para ETA
    PERFORM setval('acreedores_id_seq', (SELECT MAX(id) FROM acreedores));

    INSERT INTO acreedores (codigo, nombre, formato_archivo, activo, categoria_deficit, orden_legal_deficit)
    SELECT 'ETA', 'Escuela Técnica Aeronáutica', 'txt', true, 'otras_retenciones', 100
    WHERE NOT EXISTS (
        SELECT 1 FROM acreedores WHERE codigo = 'ETA'
    );

    RAISE NOTICE 'Acreedor ETA verificado/agregado.';

    PERFORM marcar_migracion_exitosa('005');
END;
$$;

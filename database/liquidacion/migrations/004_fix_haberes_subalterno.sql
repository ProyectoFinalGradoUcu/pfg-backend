-- ============================================================
-- Migración 004: Corregir datos de Personal Subalterno (Madruga Lopez, Yohana Paola)
--
-- Problemas identificados al comparar recibo generado vs recibo de referencia:
--
-- A) fecha_ascenso_oficial cargada para una subalterno → activa el bloque PROGRE.TROPA
--    (diseñado solo para oficiales que ascendieron desde tropa), provocando que:
--      · El main progresivo (044.001) use esa fecha → 0 años desde Sep/2025 → no emite nada
--      · PROGRE.TROPA corra: 19 años (FechaInicio→FechaAscensoOficial) + anios_servicio_anterior(1) = 20
--      · Resultado: 20 × 114.01 = 2,280.20 en vez de 19 × 114.01 = 2,166.19
--    DB comment lo confirma: "NULL para tropa (usa fecha_inicio)"
--
-- B) usa_fonasa = true para una persona militar → aplica FONASA en vez de DNS FF.AA.
--    y el descuento aparece en TOTAL DESC.PERS. en vez de TOTAL DESC.
--
-- C) Falta remuneración 42536 (PART.LEY 18834 ART: 1,362.00) para el grado Sgto.1°
--    → el ítem no aparece en el recibo.
--
-- Persona: MADRUGA LOPEZ, YOHANA PAOLA — cédula a reemplazar abajo.
-- ============================================================

-- ── CORRECCIONES ──────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT registrar_migracion('004', 'fix_haberes_subalterno') THEN
        RAISE NOTICE 'Migración 004 ya ejecutada, saltando.';
        RETURN;
    END IF;

    -- A) Limpiar fecha_ascenso_oficial para subalternos (debe ser NULL).
    --    Esto corrige el progresivo: PROGRE.TROPA deja de correr y el main progresivo
    --    usa FechaInicio correctamente → 19 años × 114.01 = 2,166.19.
    UPDATE relaciones_laborales rl
    SET fecha_ascenso_oficial = NULL
    WHERE rl.persona_id = (
        SELECT id FROM personas WHERE cedula = '43111769'
    )
    AND rl.fecha_ascenso_oficial IS NOT NULL
    AND rl.estado = 'activo';

    RAISE NOTICE 'fecha_ascenso_oficial limpiada para Madruga';

    -- B) Corregir usa_fonasa: militares usan DNS FF.AA., no FONASA.
    UPDATE relaciones_laborales
    SET usa_fonasa = false
    WHERE persona_id = (
        SELECT id FROM personas WHERE cedula = '43111769'
    )
    AND usa_fonasa = true
    AND estado = 'activo';

    RAISE NOTICE 'usa_fonasa corregido';

    -- C) Agregar remuneración 042.536 (PART.LEY 18834 ART) para el grado si falta.
    --    Sincronizar secuencia porque la carga inicial usa ids explicitos via COPY.
    PERFORM setval(
        pg_get_serial_sequence('remuneraciones_grado', 'id'),
        COALESCE((SELECT MAX(id) FROM remuneraciones_grado), 1),
        (SELECT COUNT(*) > 0 FROM remuneraciones_grado)
    );

    INSERT INTO remuneraciones_grado (grado_id, item_id, monto, tipo_monto, vigente_desde)
    SELECT 5, ci.id, 1362.00, 'mensual', DATE '2026-01-01'
    FROM catalogo_items ci
    WHERE ci.codigo = 42536
    AND NOT EXISTS (
        SELECT 1 FROM remuneraciones_grado
        WHERE grado_id = 5 AND item_id = ci.id AND vigente_desde = DATE '2026-01-01'
    );

    RAISE NOTICE 'Remuneración 42536 verificada/agregada para grado';

    PERFORM marcar_migracion_exitosa('004');
END;
$$;

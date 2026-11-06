-- ============================================================
-- Migración 20260707120000: Corregir situación de Personal Superior Reservista
--
-- Problema: personas que son reservistas superiores (FoxPro situa_per=16)
-- quedaron asignadas a SIT01 "Personal Superior en actividad" (Sit10Calculator)
-- en lugar de SIT05 "Personal Superior reservistas" (ReservaSuperiorCalculator).
--
-- Efecto del error:
--   - Se calculaba Dedicación Integral (043.004) al 50% en vez de PAO (30%)
--   - Se incluía Compensación Combatientes (042.103) que no corresponde
--   - No se calculaba Permanencia a la Orden (código 60)
--
-- Cómo identificar afectados:
--   SELECT rl.id, p.cedula, p.primer_apellido, p.primer_nombre,
--          s.codigo AS situacion_actual
--   FROM relaciones_laborales rl
--   JOIN personas p ON p.id = rl.persona_id
--   JOIN situaciones s ON s.id = rl.situacion_id
--   WHERE rl.situacion_id = 1   -- SIT01 activo
--     AND rl.estado = 'activo'
--   ORDER BY p.primer_apellido;
--
-- Completar la sección UPDATE con la/s cédula/s confirmadas.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('20260707120000', 'fix_situacion_reservistas_superiores') THEN
        RAISE NOTICE 'Migración 20260707120000 ya ejecutada, saltando.';
        RETURN;
    END IF;

    -- Actualizar cada reservista superior identificado.
    -- Reemplazar cada cédula por la real; agregar filas adicionales según corresponda.
    UPDATE relaciones_laborales
    SET situacion_id = 5   -- SIT05 "Personal Superior reservistas" → ReservaSuperiorCalculator
    WHERE persona_id IN (
        SELECT id FROM personas WHERE cedula IN (
            '40211677'  -- PEREZ RAMOS, FRANCE EDITA - Tte. 2do (Rva.)
            -- , 'OTRA_CEDULA_SI_HAY_MAS'
        )
    )
    AND situacion_id = 1;  -- solo si realmente estaban en SIT01 activo

    PERFORM marcar_migracion_exitosa('20260707120000');
END;
$$;

-- ============================================================
-- Migración 009: Corregir calculador de SIT05 (Reservista Superior)
-- Fecha: 2026-07-08
-- Descripción:
--   Asegura que SIT05 use 'ReservaSuperiorCalculator' y no el
--   calculador de tropa 'ReservaCalculator'. Idempotente.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('009', 'correccion_sit05_calculador') THEN
        RAISE NOTICE 'Migración 009 ya ejecutada, saltando.';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM situaciones
        WHERE codigo = 'SIT05'
          AND calculador IS DISTINCT FROM 'ReservaSuperiorCalculator'
    ) THEN
        UPDATE situaciones
        SET calculador = 'ReservaSuperiorCalculator'
        WHERE codigo = 'SIT05';

        RAISE NOTICE 'MIG-009: calculador de SIT05 actualizado a ReservaSuperiorCalculator';
    ELSE
        RAISE NOTICE 'MIG-009: calculador de SIT05 ya estaba correcto — sin cambios';
    END IF;

    PERFORM marcar_migracion_exitosa('009');
END;
$$;

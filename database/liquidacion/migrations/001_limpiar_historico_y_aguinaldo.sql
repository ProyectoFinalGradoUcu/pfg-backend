-- ============================================================
-- Migración 001 — Limpiar columnas no utilizadas
--
-- Cambios:
--   historico_liquidaciones: elimina FK + columnas de situación,
--     grado, escalafón, unidad, programa y régimen (nunca se leen
--     en el cálculo de aguinaldo; los datos se obtienen de
--     relaciones_laborales por persona_id).
--   aguinaldos:     elimina columna irpf_aguinaldo (no se descuenta
--                   IRPF en aguinaldo, per decisión del cliente).
--   aguinaldo_baja: elimina columna irpf (misma razón).
-- ============================================================

DO $$
DECLARE
    v_version VARCHAR(50) := '001';
    v_nombre  VARCHAR(200) := 'Limpiar columnas no utilizadas en historico_liquidaciones, aguinaldos y aguinaldo_baja';
BEGIN
    IF NOT registrar_migracion(v_version, v_nombre) THEN
        RETURN;
    END IF;

    -- --------------------------------------------------------
    -- historico_liquidaciones: eliminar FK de columnas a borrar
    -- --------------------------------------------------------
    ALTER TABLE historico_liquidaciones
        DROP CONSTRAINT IF EXISTS historico_liquidaciones_situacion_id_fkey,
        DROP CONSTRAINT IF EXISTS historico_liquidaciones_grado_id_fkey,
        DROP CONSTRAINT IF EXISTS historico_liquidaciones_escalafon_id_fkey,
        DROP CONSTRAINT IF EXISTS historico_liquidaciones_unidad_id_fkey,
        DROP CONSTRAINT IF EXISTS historico_liquidaciones_programa_id_fkey,
        DROP CONSTRAINT IF EXISTS historico_liquidaciones_regimen_id_fkey;

    -- historico_liquidaciones: eliminar columnas
    ALTER TABLE historico_liquidaciones
        DROP COLUMN IF EXISTS situacion_id,
        DROP COLUMN IF EXISTS grado_id,
        DROP COLUMN IF EXISTS escalafon_id,
        DROP COLUMN IF EXISTS unidad_id,
        DROP COLUMN IF EXISTS programa_id,
        DROP COLUMN IF EXISTS regimen_id;

    -- --------------------------------------------------------
    -- aguinaldos: eliminar columna irpf_aguinaldo
    -- --------------------------------------------------------
    ALTER TABLE aguinaldos
        DROP COLUMN IF EXISTS irpf_aguinaldo;

    -- --------------------------------------------------------
    -- aguinaldo_baja: eliminar columna irpf
    -- --------------------------------------------------------
    ALTER TABLE aguinaldo_baja
        DROP COLUMN IF EXISTS irpf;

    PERFORM marcar_migracion_exitosa(v_version);

EXCEPTION WHEN OTHERS THEN
    PERFORM marcar_migracion_fallida(v_version, SQLERRM);
    RAISE;
END;
$$;

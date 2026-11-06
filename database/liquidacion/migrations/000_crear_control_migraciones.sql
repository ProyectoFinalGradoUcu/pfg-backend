-- ============================================================
-- Bootstrap — Control de migraciones
-- Se ejecuta siempre antes que cualquier migración.
-- Usa IF NOT EXISTS / CREATE OR REPLACE para ser idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id                  SERIAL       PRIMARY KEY,
    version             VARCHAR(50)  NOT NULL UNIQUE,
    nombre              VARCHAR(200) NOT NULL,
    ejecutado_en        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum            VARCHAR(64)  NULL,
    usuario             VARCHAR(100) NULL,
    tiempo_ejecucion_ms INTEGER      NULL,
    estado              VARCHAR(20)  NOT NULL DEFAULT 'SUCCESS'
        CHECK (estado IN ('SUCCESS', 'FAILED', 'RUNNING')),
    error_mensaje       TEXT         NULL
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_estado  ON schema_migrations(estado);

CREATE OR REPLACE FUNCTION registrar_migracion(
    p_version  VARCHAR(50),
    p_nombre   VARCHAR(200),
    p_checksum VARCHAR(64) DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE v_existe BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM schema_migrations WHERE version = p_version AND estado = 'SUCCESS'
    ) INTO v_existe;
    IF v_existe THEN
        RAISE NOTICE 'Migracion % ya ejecutada, saltando...', p_version;
        RETURN FALSE;
    END IF;
    INSERT INTO schema_migrations (version, nombre, checksum, usuario, estado)
    VALUES (p_version, p_nombre, p_checksum, current_user, 'RUNNING')
    ON CONFLICT (version) DO UPDATE SET ejecutado_en = CURRENT_TIMESTAMP, estado = 'RUNNING';
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION marcar_migracion_exitosa(
    p_version   VARCHAR(50),
    p_tiempo_ms INTEGER DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE schema_migrations
    SET estado = 'SUCCESS', tiempo_ejecucion_ms = p_tiempo_ms, ejecutado_en = CURRENT_TIMESTAMP
    WHERE version = p_version;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION marcar_migracion_fallida(
    p_version VARCHAR(50),
    p_error   TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE schema_migrations
    SET estado = 'FAILED', error_mensaje = p_error, ejecutado_en = CURRENT_TIMESTAMP
    WHERE version = p_version;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION migracion_ejecutada(p_version VARCHAR(50))
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM schema_migrations WHERE version = p_version AND estado = 'SUCCESS'
    );
END;
$$ LANGUAGE plpgsql;

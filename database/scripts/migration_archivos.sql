-- ============================================================================
-- MIGRACIÓN: Almacenamiento de archivos (MinIO)
--
-- Crea la tabla `archivos` (registro central de objetos guardados en MinIO) y
-- `personas_documentos` (documentación libre de cada funcionario).
--
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.archivos (
    id              BIGSERIAL PRIMARY KEY,
    bucket          VARCHAR(63)  NOT NULL,
    object_key      VARCHAR(500) NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    content_type    VARCHAR(100) NOT NULL,
    tamanio_bytes   BIGINT       NOT NULL,
    sha256          CHAR(64)     NOT NULL,
    subido_por      BIGINT       REFERENCES public.usuarios(id),
    subido_en       TIMESTAMP    NOT NULL DEFAULT now(),
    eliminado_en    TIMESTAMP,
    eliminado_por   BIGINT       REFERENCES public.usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_archivos_object_key
    ON public.archivos (bucket, object_key);

CREATE INDEX IF NOT EXISTS ix_archivos_sha256
    ON public.archivos (sha256);

-- Documentación libre de cada funcionario (cédula, escaneos). N por persona.
-- Sin columnas de auditoría: quién subió, cuándo y el borrado lógico están en
-- `archivos`. Activo = su archivo no tiene `eliminado_en`. Al borrar, esta fila
-- se queda: preserva a quién pertenecía el documento.
CREATE TABLE IF NOT EXISTS public.personas_documentos (
    id          BIGSERIAL    PRIMARY KEY,
    persona_id  BIGINT       NOT NULL REFERENCES public.personas(id),
    archivo_id  BIGINT       NOT NULL UNIQUE REFERENCES public.archivos(id),
    descripcion VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS ix_personas_documentos_persona
    ON public.personas_documentos (persona_id);

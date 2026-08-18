-- ─── Misiones v2: catálogo + convocatorias + funcionarios-convocatoria ────────

-- 1. Agregar nombre_mision al catálogo de misiones
ALTER TABLE misiones
  ADD COLUMN IF NOT EXISTS nombre_mision VARCHAR(200);

-- 2. Tabla de convocatorias (instancia de una misión en un momento concreto)
CREATE TABLE IF NOT EXISTS convocatorias (
    id            BIGSERIAL PRIMARY KEY,
    mision_id     BIGINT NOT NULL REFERENCES misiones(id) ON DELETE CASCADE,
    numero_orden  VARCHAR(50),
    boletin       VARCHAR(50),
    fecha_salida  DATE,
    fecha_llegada DATE,
    observaciones TEXT
);

-- 3. Asignación funcionario ↔ convocatoria (número de orden/boletín propios)
CREATE TABLE IF NOT EXISTS funcionarios_convocatorias (
    id              BIGSERIAL PRIMARY KEY,
    convocatoria_id BIGINT NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
    persona_id      BIGINT NOT NULL REFERENCES personas(id) ON DELETE NO ACTION,
    numero_orden    VARCHAR(50),
    boletin         VARCHAR(50),
    observaciones   TEXT,
    UNIQUE (convocatoria_id, persona_id)
);

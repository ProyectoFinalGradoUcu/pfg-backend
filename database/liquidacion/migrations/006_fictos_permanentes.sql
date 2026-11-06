-- ============================================================
-- 006 - Padrón permanente de fictos
-- ============================================================

CREATE TABLE IF NOT EXISTS fictos_persona (
    id                    bigserial PRIMARY KEY,
    persona_id            bigint NOT NULL REFERENCES personas(id),
    acreedor_id           bigint NOT NULL REFERENCES acreedores(id),
    catalogo_item_id      bigint NOT NULL REFERENCES catalogo_items(id),
    importe               numeric(14,2) NOT NULL,
    activo                boolean NOT NULL DEFAULT true,
    observaciones         text,
    fecha_creacion        timestamp with time zone NOT NULL DEFAULT now(),
    fecha_modificacion    timestamp with time zone,
    fecha_baja            timestamp with time zone,
    usuario_creacion_id   bigint REFERENCES usuarios(id),
    usuario_modificacion_id bigint REFERENCES usuarios(id),
    usuario_baja_id       bigint REFERENCES usuarios(id),
    CONSTRAINT ck_fictos_persona_importe_positivo CHECK (importe > 0),
    CONSTRAINT uq_fictos_persona_persona_catalogo UNIQUE (persona_id, catalogo_item_id)
);

CREATE INDEX IF NOT EXISTS ix_fictos_persona_activo_persona
    ON fictos_persona (activo, persona_id);

CREATE INDEX IF NOT EXISTS ix_fictos_persona_catalogo
    ON fictos_persona (catalogo_item_id);

INSERT INTO acciones (nombre, descripcion)
VALUES
    ('CrearFicto', 'Crear un ficto permanente'),
    ('ActualizarFicto', 'Actualizar un ficto permanente'),
    ('DarBajaFicto', 'Dar de baja un ficto permanente'),
    ('ReactivarFicto', 'Reactivar un ficto permanente'),
    ('ImportarFictos', 'Importar el padrón permanente de fictos')
ON CONFLICT (nombre) DO NOTHING;

-- Migrar el registro mensual más reciente de cada persona y concepto ficto.
-- El acreedor se normaliza a MDN y los registros históricos se conservan.
WITH acreedor_mdn AS (
    SELECT id
    FROM acreedores
    WHERE codigo = 'MDN'
    ORDER BY activo DESC, id
    LIMIT 1
),
candidatos AS (
    SELECT
        dp.persona_id,
        dp.catalogo_item_id,
        dp.importe,
        dp.observaciones,
        dp.fecha_creacion,
        dp.usuario_creacion_id,
        row_number() OVER (
            PARTITION BY dp.persona_id, dp.catalogo_item_id
            ORDER BY p.anio DESC, p.mes DESC, dp.id DESC
        ) AS orden
    FROM descuentos_personal_periodo dp
    INNER JOIN periodos_liquidacion p ON p.id = dp.periodo_id
    INNER JOIN catalogo_items ci ON ci.id = dp.catalogo_item_id
    WHERE ci.tipo = 'descuento_personal'
      AND ci.item_par_ficto_id IS NOT NULL
      AND dp.importe > 0
      AND dp.estado NOT IN ('anulado', 'no_revista')
)
INSERT INTO fictos_persona (
    persona_id,
    acreedor_id,
    catalogo_item_id,
    importe,
    activo,
    observaciones,
    fecha_creacion,
    usuario_creacion_id
)
SELECT
    c.persona_id,
    mdn.id,
    c.catalogo_item_id,
    c.importe,
    true,
    c.observaciones,
    c.fecha_creacion AT TIME ZONE 'UTC',
    c.usuario_creacion_id
FROM candidatos c
CROSS JOIN acreedor_mdn mdn
WHERE c.orden = 1
ON CONFLICT (persona_id, catalogo_item_id) DO NOTHING;

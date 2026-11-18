-- ============================================================================
-- MIGRACIÓN: Derecha y numor del personal en actividad
--
-- La derecha es el orden de precedencia dentro de una escala (Oficiales o
-- Personal Subalterno). Cada grado ocupa un bloque contiguo de la escala según
-- `derecha_jerarquia_grados`. El numor se numera dentro de (grado, escalafón).
--
-- `grados.orden` no sirve como jerarquía (aerotécnicos y cadetes quedan por
-- encima del General) y el catálogo es de liquidación, por eso la jerarquía va
-- en una tabla propia. Cadetes y aprendices no tienen derecha.
--
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.derecha_jerarquia_grados (
    grado_id BIGINT      PRIMARY KEY REFERENCES public.grados(id),
    escala   VARCHAR(20) NOT NULL CHECK (escala IN ('OFICIALES', 'SUBALTERNOS')),
    posicion SMALLINT    NOT NULL CHECK (posicion > 0),
    CONSTRAINT uq_derecha_jerarquia_escala_posicion UNIQUE (escala, posicion)
);

-- Posición 1 = grado de mayor jerarquía de la escala.
INSERT INTO public.derecha_jerarquia_grados (grado_id, escala, posicion)
SELECT g.id, t.escala, t.posicion
FROM (VALUES
  ('GRAL',      'OFICIALES',   1),
  ('BRIG_GRAL', 'OFICIALES',   2),
  ('CNEL',      'OFICIALES',   3),
  ('TTE_CNEL',  'OFICIALES',   4),
  ('MAY',       'OFICIALES',   5),
  ('CAP',       'OFICIALES',   6),
  ('TTE_1RO',   'OFICIALES',   7),
  ('TTE_2DO',   'OFICIALES',   8),
  ('ALF',       'OFICIALES',   9),
  ('SUP_AT',    'SUBALTERNOS', 1),
  ('INST_AT',   'SUBALTERNOS', 2),
  ('AT_PPAL',   'SUBALTERNOS', 3),
  ('AT_1RA',    'SUBALTERNOS', 4),
  ('AT_2DA',    'SUBALTERNOS', 5),
  ('SOM',       'SUBALTERNOS', 6),
  ('SGTO_1RO',  'SUBALTERNOS', 7),
  ('SGTO',      'SUBALTERNOS', 8),
  ('CBO_1RA',   'SUBALTERNOS', 9),
  ('CBO_2DA',   'SUBALTERNOS', 10),
  ('SDO_1RA',   'SUBALTERNOS', 11),
  ('SDO_2DA',   'SUBALTERNOS', 12)
) AS t(codigo, escala, posicion)
JOIN public.grados g ON g.codigo = t.codigo
ON CONFLICT (grado_id) DO NOTHING;

ALTER TABLE public.relaciones_laborales
    ADD COLUMN IF NOT EXISTS derecha        INTEGER,
    ADD COLUMN IF NOT EXISTS numor          INTEGER,
    ADD COLUMN IF NOT EXISTS escala_derecha VARCHAR(20);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_relaciones_laborales_derecha') THEN
        ALTER TABLE public.relaciones_laborales
            ADD CONSTRAINT ck_relaciones_laborales_derecha CHECK (
                (derecha IS NULL OR derecha > 0)
                AND (numor IS NULL OR numor > 0)
                AND ((derecha IS NULL) = (escala_derecha IS NULL))
            );
    END IF;

    -- DEFERRABLE: los corrimientos masivos pasan por estados intermedios con
    -- valores repetidos; la unicidad se controla al confirmar la transacción.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_relaciones_laborales_derecha') THEN
        ALTER TABLE public.relaciones_laborales
            ADD CONSTRAINT uq_relaciones_laborales_derecha
            UNIQUE (escala_derecha, derecha) DEFERRABLE INITIALLY DEFERRED;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_relaciones_laborales_numor') THEN
        ALTER TABLE public.relaciones_laborales
            ADD CONSTRAINT uq_relaciones_laborales_numor
            UNIQUE (grado_id, escalafon_id, numor) DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.historial_derecha_numor (
    id             BIGSERIAL    PRIMARY KEY,
    persona_id     BIGINT       NOT NULL REFERENCES public.personas(id),
    tipo           VARCHAR(10)  NOT NULL CHECK (tipo IN ('DERECHA', 'NUMOR')),
    valor_anterior INTEGER,
    valor_nuevo    INTEGER,
    operacion      VARCHAR(20)  NOT NULL
        CHECK (operacion IN ('ALTA', 'BAJA', 'REORDEN', 'ASCENSO', 'CAMBIO_ESCALAFON')),
    motivo         TEXT,
    usuario_id     BIGINT       REFERENCES public.usuarios(id),
    fecha          TIMESTAMP    NOT NULL DEFAULT now(),
    lote_id        UUID         NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_historial_derecha_numor_persona
    ON public.historial_derecha_numor (persona_id, fecha DESC);

CREATE INDEX IF NOT EXISTS ix_historial_derecha_numor_lote
    ON public.historial_derecha_numor (lote_id);

-- Carga inicial de cada escala sin derecha ni numor: la base nueva, o los
-- subalternos después de importar (el Access solo trae la de los oficiales).
-- Dentro del grado, el mismo orden que "Sugerir orden > Antigüedad" de la
-- pantalla, y los empates por ingreso y edad (art. 51 de la Ley 19.775).
CREATE OR REPLACE FUNCTION public.cargar_derecha_inicial() RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    cargados INTEGER;
BEGIN
    WITH escalas_vacias AS (
        SELECT DISTINCT j.escala
        FROM public.derecha_jerarquia_grados j
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.relaciones_laborales r
            JOIN public.derecha_jerarquia_grados jr ON jr.grado_id = r.grado_id
            WHERE jr.escala = j.escala AND (r.derecha IS NOT NULL OR r.numor IS NOT NULL)
        )
    ),
    -- Una por persona: con dos vigentes gana la más reciente, como en la aplicación.
    vigentes AS (
        SELECT DISTINCT ON (r.persona_id) r.id, r.persona_id, r.grado_id, r.escalafon_id,
               COALESCE(r.fecha_ultimo_ascenso, r.fecha_inicio) AS ingreso_grado
        FROM public.relaciones_laborales r
        WHERE r.fecha_fin IS NULL AND r.estado = 'activo'
        ORDER BY r.persona_id, r.fecha_inicio DESC, r.id DESC
    ),
    -- Liquidación cierra la relación y abre otra en cada cambio: el ingreso es la primera.
    ingreso AS (
        SELECT persona_id, min(fecha_inicio) AS fecha
        FROM public.relaciones_laborales
        GROUP BY persona_id
    ),
    orden AS (
        SELECT v.id, j.escala,
               ROW_NUMBER() OVER (
                   PARTITION BY j.escala
                   ORDER BY j.posicion, v.ingreso_grado NULLS LAST, lm.fecha_egreso_eta NULLS LAST,
                            i.fecha NULLS LAST, p.fecha_nacimiento NULLS LAST, v.id) AS derecha,
               ROW_NUMBER() OVER (
                   PARTITION BY v.grado_id, v.escalafon_id
                   ORDER BY v.ingreso_grado NULLS LAST, lm.fecha_egreso_eta NULLS LAST,
                            i.fecha NULLS LAST, p.fecha_nacimiento NULLS LAST, v.id) AS numor
        FROM vigentes v
        JOIN public.derecha_jerarquia_grados j ON j.grado_id = v.grado_id
        JOIN escalas_vacias e ON e.escala = j.escala
        JOIN public.personas p ON p.id = v.persona_id
        LEFT JOIN public.legajo_militar lm ON lm.persona_id = v.persona_id
        LEFT JOIN ingreso i ON i.persona_id = v.persona_id
    ),
    cargadas AS (
        UPDATE public.relaciones_laborales r
        SET derecha = o.derecha, numor = o.numor, escala_derecha = o.escala
        FROM orden o
        WHERE o.id = r.id
        RETURNING r.persona_id, r.derecha, r.numor
    ),
    historial AS (
        INSERT INTO public.historial_derecha_numor (persona_id, tipo, valor_anterior, valor_nuevo, operacion, motivo, lote_id)
        SELECT c.persona_id, t.tipo, NULL, t.valor, 'ALTA',
               'Carga inicial por precedencia (Ley 19.775, art. 51)', l.id
        FROM cargadas c
        CROSS JOIN (SELECT gen_random_uuid() AS id) l
        CROSS JOIN LATERAL (VALUES ('DERECHA', c.derecha), ('NUMOR', c.numor)) AS t(tipo, valor)
    )
    SELECT count(*) INTO cargados FROM cargadas;
    RETURN cargados;
END $$;

SELECT public.cargar_derecha_inicial();

INSERT INTO public.permisos (nombre, descripcion, aplicacion)
VALUES ('derecha.gestionar', 'Modificar la derecha y el numor del personal', 'personal')
ON CONFLICT (nombre, aplicacion) DO NOTHING;

INSERT INTO public.roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permisos p ON p.nombre = 'derecha.gestionar' AND p.aplicacion = 'personal'
WHERE r.aplicacion = 'personal'
  AND r.nombre IN ('Administrador del sistema', 'Oficina de Personal')
ON CONFLICT DO NOTHING;

COMMIT;

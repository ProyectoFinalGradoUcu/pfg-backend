-- ============================================================================
-- MIGRACIÓN: Horas de vuelo por período
--
-- Reemplaza la planilla Excel en la que las unidades cargaban las horas de
-- vuelo: el año se divide en 4 períodos y en cada uno aparece todo el personal
-- en actividad (oficiales y subalternos) con su unidad de vuelo, las aeronaves
-- y las horas de Anexo A (Av) y Anexo B (Ob), del año militar y totales.
--
-- `vuelos` y `funcionarios_vuelos` son de liquidaciones (riesgo de vuelo) y no
-- se tocan: estas tablas son NUESTRAS.
--
-- Cada registro guarda grado, escalafón y categoría del momento en que se
-- generó el período, para que el histórico se filtre y exporte como estaba.
--
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.unidades_vuelo (
    id           BIGSERIAL    PRIMARY KEY,
    denominacion VARCHAR(100) NOT NULL,
    vigente      BOOLEAN      NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_unidades_vuelo_denominacion
    ON public.unidades_vuelo (lower(denominacion));

INSERT INTO public.unidades_vuelo (denominacion)
SELECT d.denominacion
FROM (VALUES
  ('Esc. Aér. 2'),
  ('Esc. Aér. 3'),
  ('Esc. Aér. 5'),
  ('Esc. Aér. 7'),
  ('E.V.B'),
  ('I.A.A.'),
  ('Serv. Mant.'),
  ('S.S.R.A.'),
  ('Esc. Enlace')
) AS d(denominacion)
WHERE NOT EXISTS (
    SELECT 1 FROM public.unidades_vuelo u WHERE lower(u.denominacion) = lower(d.denominacion)
);

-- El año militar coincide con el año calendario: períodos 1 a 4 de `anio`.
CREATE TABLE IF NOT EXISTS public.periodos_vuelo (
    id         BIGSERIAL PRIMARY KEY,
    anio       SMALLINT  NOT NULL CHECK (anio BETWEEN 1900 AND 2999),
    numero     SMALLINT  NOT NULL CHECK (numero BETWEEN 1 AND 4),
    cerrado    BOOLEAN   NOT NULL DEFAULT false,
    creado_en  TIMESTAMP NOT NULL DEFAULT now(),
    usuario_id BIGINT    REFERENCES public.usuarios(id),
    CONSTRAINT uq_periodos_vuelo_anio_numero UNIQUE (anio, numero)
);

CREATE TABLE IF NOT EXISTS public.registros_vuelo (
    id                 BIGSERIAL     PRIMARY KEY,
    periodo_id         BIGINT        NOT NULL REFERENCES public.periodos_vuelo(id),
    persona_id         BIGINT        NOT NULL REFERENCES public.personas(id),
    grado_id           BIGINT        REFERENCES public.grados(id),
    escalafon_id       BIGINT        REFERENCES public.escalafones(id),
    tipo_funcionario   VARCHAR(20),
    unidad_vuelo_id    BIGINT        REFERENCES public.unidades_vuelo(id),
    aeronaves          TEXT,
    hs_av_anio_militar NUMERIC(10,1) NOT NULL DEFAULT 0 CHECK (hs_av_anio_militar >= 0),
    hs_av_total        NUMERIC(10,1) NOT NULL DEFAULT 0 CHECK (hs_av_total >= 0),
    hs_ob_anio_militar NUMERIC(10,1) NOT NULL DEFAULT 0 CHECK (hs_ob_anio_militar >= 0),
    hs_ob_total        NUMERIC(10,1) NOT NULL DEFAULT 0 CHECK (hs_ob_total >= 0),
    -- NULL = fila generada al abrir el período y nunca editada.
    editado_en         TIMESTAMP,
    editado_por        BIGINT        REFERENCES public.usuarios(id),
    CONSTRAINT uq_registros_vuelo_periodo_persona UNIQUE (periodo_id, persona_id)
);

CREATE INDEX IF NOT EXISTS ix_registros_vuelo_persona
    ON public.registros_vuelo (persona_id);

-- Cada cambio de unidad de vuelo de una persona, con el período en que se hizo.
CREATE TABLE IF NOT EXISTS public.historial_unidad_vuelo (
    id                 BIGSERIAL PRIMARY KEY,
    persona_id         BIGINT    NOT NULL REFERENCES public.personas(id),
    periodo_id         BIGINT    NOT NULL REFERENCES public.periodos_vuelo(id),
    unidad_anterior_id BIGINT    REFERENCES public.unidades_vuelo(id),
    unidad_nueva_id    BIGINT    REFERENCES public.unidades_vuelo(id),
    usuario_id         BIGINT    REFERENCES public.usuarios(id),
    fecha              TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_historial_unidad_vuelo_persona
    ON public.historial_unidad_vuelo (persona_id, fecha DESC);

INSERT INTO public.contextos (nombre, descripcion)
VALUES ('Vuelos', 'Períodos, horas de vuelo y unidades de vuelo')
ON CONFLICT (nombre) DO NOTHING;

-- vuelos.ver / vuelos.gestionar ya existen (seed_integracion_personal); faltan
-- las variantes acotadas a la propia unidad, para que cada unidad cargue a su gente.
INSERT INTO public.permisos (nombre, descripcion, aplicacion)
VALUES
  ('vuelos.ver.unidad',       'Consultar las horas de vuelo únicamente del personal de la propia unidad', 'personal'),
  ('vuelos.gestionar.unidad', 'Cargar horas de vuelo únicamente al personal de la propia unidad',         'personal')
ON CONFLICT (nombre, aplicacion) DO NOTHING;

INSERT INTO public.roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM (VALUES
  ('Operador de Personal', 'vuelos.ver.unidad'),
  ('Operador de Personal', 'vuelos.gestionar.unidad'),
  ('Consulta',             'vuelos.ver.unidad')
) AS t(rol, permiso)
JOIN public.roles r    ON r.nombre = t.rol AND r.aplicacion = 'personal'
JOIN public.permisos p ON p.nombre = t.permiso AND p.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

COMMIT;

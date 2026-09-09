-- MIGRACIÓN: Módulo de Ascensos
--
-- Crea las tablas propias del módulo y extiende `ascensos`, que también es
-- nuestra. De las tablas del sistema de liquidación solo se leen ids por
-- foreign key: `reglas_ascenso` queda vacía y sin tocar.
--
-- Los datos de demostración van en seed_demo.sql y las reglas y cursos de la FAU
-- en seed_ascensos.sql. Lo único que toca datos es el bloque del final, que 
-- aplica a la VM que tenemos en prod para hacer de DEMO a la FAU.

BEGIN;

-- Reglas de ascenso personalizables

-- Un tramo "grado origen → grado destino" por fila. Editar no sobreescribe: se
-- cierra la vigente con `vigente_hasta` y se crea una versión nueva.
CREATE TABLE IF NOT EXISTS public.ascensos_reglas (
    id               BIGSERIAL PRIMARY KEY,
    nombre           VARCHAR(150) NOT NULL,
    grado_origen_id  BIGINT NOT NULL REFERENCES public.grados(id),
    grado_destino_id BIGINT NOT NULL REFERENCES public.grados(id),
    dias_minimos     INTEGER NOT NULL CHECK (dias_minimos > 0),
    edad_maxima      SMALLINT,
    notas            TEXT,
    es_por_defecto   BOOLEAN NOT NULL DEFAULT FALSE,
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    vigente_desde    DATE NOT NULL DEFAULT CURRENT_DATE,
    vigente_hasta    DATE,
    actualizado_por  BIGINT REFERENCES public.usuarios(id),
    actualizado_en   TIMESTAMP NOT NULL DEFAULT now()
);

-- Un solo tramo vigente por grado de origen.
CREATE UNIQUE INDEX IF NOT EXISTS uix_ascensos_reglas_origen_vigente
    ON public.ascensos_reglas (grado_origen_id)
    WHERE activo AND vigente_hasta IS NULL;

CREATE INDEX IF NOT EXISTS idx_ascensos_reglas_origen
    ON public.ascensos_reglas (grado_origen_id);

--   tipo:      CURSO_APROBADO | ANTIGUEDAD_SERVICIO
--   modo:      TODOS | ALGUNO (de los cursos vinculados)
--   aplica_si: SIEMPRE | ES_MUTADO | NO_ES_MUTADO | EGRESADO_ETA |
--              NO_EGRESADO_ETA | NIVEL_LICEAL. Con una que se cumpla, aplica.
CREATE TABLE IF NOT EXISTS public.ascensos_reglas_requisitos (
    id          BIGSERIAL PRIMARY KEY,
    regla_id    BIGINT NOT NULL REFERENCES public.ascensos_reglas(id) ON DELETE CASCADE,
    tipo        VARCHAR(40) NOT NULL,
    descripcion VARCHAR(200) NOT NULL,
    modo        VARCHAR(10) NOT NULL DEFAULT 'TODOS',
    aplica_si   TEXT[] NOT NULL DEFAULT '{SIEMPRE}',
    parametros  JSONB,
    orden       SMALLINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_ascensos_reglas_requisitos_regla
    ON public.ascensos_reglas_requisitos (regla_id);

-- Cursos que satisfacen un requisito de tipo CURSO_APROBADO.
CREATE TABLE IF NOT EXISTS public.ascensos_reglas_requisito_cursos (
    requisito_id BIGINT NOT NULL REFERENCES public.ascensos_reglas_requisitos(id) ON DELETE CASCADE,
    curso_id     BIGINT NOT NULL REFERENCES public.cursos(id),
    PRIMARY KEY (requisito_id, curso_id)
);

-- Órdenes de ascenso

-- La orden (N.º de O.C.G.F.A.) alcanza a varios funcionarios y se registra,
-- consulta y anula como un todo.
CREATE TABLE IF NOT EXISTS public.ascensos_ordenes (
    id               BIGSERIAL PRIMARY KEY,
    numero_orden     VARCHAR(50),
    fecha_orden      DATE NOT NULL,
    boletin          VARCHAR(50),
    observaciones    TEXT,
    anulada_en       TIMESTAMP,
    anulada_por      BIGINT REFERENCES public.usuarios(id),
    motivo_anulacion TEXT,
    creada_por       BIGINT REFERENCES public.usuarios(id),
    creada_en        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ascensos_ordenes_fecha
    ON public.ascensos_ordenes (fecha_orden DESC);

CREATE INDEX IF NOT EXISTS idx_ascensos_ordenes_numero
    ON public.ascensos_ordenes (numero_orden);

-- La orden se identifica por el N.º de O.C.G.F.A. o por el boletín: se exige al
-- menos uno de los dos, como en destinos, misiones y cursos. La regla se valida
-- en el DTO y el service; acá alcanza con que la columna admita null.
-- El ALTER es para las bases creadas antes de este cambio, cuando la columna
-- nacía NOT NULL; en volumen nuevo no hace nada.
ALTER TABLE public.ascensos_ordenes
    ALTER COLUMN numero_orden DROP NOT NULL;

-- `ascensos` pasa a ser el historial completo

ALTER TABLE public.ascensos
    ADD COLUMN IF NOT EXISTS orden_ascenso_id             BIGINT REFERENCES public.ascensos_ordenes(id),
    ADD COLUMN IF NOT EXISTS relacion_laboral_anterior_id BIGINT REFERENCES public.relaciones_laborales(id),
    ADD COLUMN IF NOT EXISTS relacion_laboral_nueva_id    BIGINT REFERENCES public.relaciones_laborales(id),
    ADD COLUMN IF NOT EXISTS grado_anterior_id            BIGINT REFERENCES public.grados(id),
    ADD COLUMN IF NOT EXISTS numero_orden                 VARCHAR(50),
    ADD COLUMN IF NOT EXISTS regla_id                     BIGINT REFERENCES public.ascensos_reglas(id),
    ADD COLUMN IF NOT EXISTS cumplia_requisitos           BOOLEAN,
    ADD COLUMN IF NOT EXISTS evaluacion                   JSONB,
    ADD COLUMN IF NOT EXISTS motivo_excepcion             TEXT,
    ADD COLUMN IF NOT EXISTS anulado_en                   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS anulado_por                  BIGINT REFERENCES public.usuarios(id),
    ADD COLUMN IF NOT EXISTS motivo_anulacion             TEXT,
    ADD COLUMN IF NOT EXISTS registrado_por               BIGINT REFERENCES public.usuarios(id),
    ADD COLUMN IF NOT EXISTS creado_en                    TIMESTAMP NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ascensos_persona_fecha
    ON public.ascensos (persona_id, fecha_ascenso DESC);

CREATE INDEX IF NOT EXISTS idx_ascensos_orden
    ON public.ascensos (orden_ascenso_id);

-- Legajo militar

-- 1:1 con `personas`, con los datos que las reglas necesitan y liquidación no
-- tiene. La mutación no va acá: vive en `relaciones_laborales.mutaciones`.
CREATE TABLE IF NOT EXISTS public.legajo_militar (
    persona_id              BIGINT PRIMARY KEY REFERENCES public.personas(id),
    nivel_educativo         VARCHAR(30),
    fecha_ingreso_eta       DATE,
    fecha_egreso_eta        DATE,
    numero_orden_egreso_eta VARCHAR(50),
    actualizado_en          TIMESTAMP NOT NULL DEFAULT now()
);

-- Alineados con el enum del backend.
DO $ck$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'legajo_militar_nivel_educativo_check'
    ) THEN
        ALTER TABLE public.legajo_militar
            ADD CONSTRAINT legajo_militar_nivel_educativo_check
            CHECK (nivel_educativo IS NULL OR nivel_educativo IN (
                'PRIMARIA',
                'CICLO_BASICO_INCOMPLETO',
                'CICLO_BASICO',
                'BACHILLERATO_INCOMPLETO',
                'BACHILLERATO',
                'BACHILLERATO_TECNOLOGICO',
                'TERCIARIO'
            ));
    END IF;
END
$ck$;

-- Ascensos cargados antes de este módulo

UPDATE public.ascensos
SET numero_orden = observaciones
WHERE numero_orden IS NULL
  AND observaciones IS NOT NULL
  AND length(observaciones) <= 50;

WITH previos AS (
    SELECT a.id,
           LAG(a.grado_id) OVER (
               PARTITION BY a.persona_id
               ORDER BY a.fecha_ascenso NULLS FIRST, a.id
           ) AS grado_previo
    FROM public.ascensos a
)
UPDATE public.ascensos a
SET grado_anterior_id = p.grado_previo
FROM previos p
WHERE p.id = a.id
  AND a.grado_anterior_id IS NULL
  AND p.grado_previo IS NOT NULL;

UPDATE public.ascensos a
SET grado_anterior_id = NULL
FROM public.grados g_ant, public.grados g_new
WHERE a.grado_anterior_id = g_ant.id
  AND a.grado_id = g_new.id
  AND g_ant.orden >= g_new.orden;

UPDATE public.relaciones_laborales r
SET fecha_ultimo_ascenso = ult.fecha_ascenso
FROM (
    SELECT persona_id, MAX(fecha_ascenso) AS fecha_ascenso
    FROM public.ascensos
    WHERE fecha_ascenso IS NOT NULL
      AND anulado_en IS NULL
    GROUP BY persona_id
) ult
WHERE r.persona_id = ult.persona_id
  AND r.fecha_fin IS NULL
  AND r.fecha_ultimo_ascenso IS NULL
  AND ult.fecha_ascenso >= r.fecha_inicio;

COMMIT;
BEGIN;

ALTER TABLE IF EXISTS public.personas
    ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(200),
    ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
    ADD COLUMN IF NOT EXISTS etnia VARCHAR(50),
    ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(50),
    ADD COLUMN IF NOT EXISTS codigo_postal VARCHAR(20),
    ADD COLUMN IF NOT EXISTS seccional VARCHAR(100),
    ADD COLUMN IF NOT EXISTS foto BYTEA,
    ADD COLUMN IF NOT EXISTS fecha_fallecimiento DATE,
    ADD COLUMN IF NOT EXISTS es_civil BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.relaciones_laborales
    ADD COLUMN IF NOT EXISTS tipo_funcionario VARCHAR(20),
    ADD COLUMN IF NOT EXISTS tiene_mando BOOLEAN,
    ADD COLUMN IF NOT EXISTS posicion_rango INTEGER,
    ADD COLUMN IF NOT EXISTS motivo_baja TEXT,
    ADD COLUMN IF NOT EXISTS fecha_baja DATE,
    ADD COLUMN IF NOT EXISTS mutaciones TEXT,
    ADD COLUMN IF NOT EXISTS conducta TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'relaciones_laborales_tipo_funcionario_check'
          AND conrelid = 'public.relaciones_laborales'::regclass
    ) THEN
        ALTER TABLE public.relaciones_laborales
            ADD CONSTRAINT relaciones_laborales_tipo_funcionario_check
            CHECK (
                tipo_funcionario IS NULL
                OR tipo_funcionario IN ('subalterno', 'oficial')
            );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.escalafones_grados (
    escalafon_id BIGINT NOT NULL REFERENCES public.escalafones(id),
    grado_id BIGINT NOT NULL REFERENCES public.grados(id),
    PRIMARY KEY (escalafon_id, grado_id)
);

INSERT INTO public.escalafones_grados (escalafon_id, grado_id)
SELECT g.escalafon_id, g.id
FROM public.grados g
ON CONFLICT DO NOTHING;


CREATE TABLE IF NOT EXISTS public.misiones (
    id BIGSERIAL PRIMARY KEY,
    pais VARCHAR(100),
    tipo_mision VARCHAR(100),
    fecha_salida DATE,
    fecha_llegada DATE,
    numero_orden VARCHAR(50),
    boletin VARCHAR(50),
    observaciones TEXT,
    comando_responsable VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS public.destinos (
    id BIGSERIAL PRIMARY KEY,
    ubicacion VARCHAR(200),
    numero_orden VARCHAR(50),
    tipo_destino VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS public.vuelos (
    id BIGSERIAL PRIMARY KEY,
    anio INTEGER,
    trimestre INTEGER,
    tipo_aeronave VARCHAR(100),
    modelo_aeronave VARCHAR(100),
    funcion VARCHAR(100),
    horas_vuelo NUMERIC(10, 2),
    horas_vuelo_ficticias NUMERIC(10, 2),
    horas_totales NUMERIC(10, 2),
    tipo_licencia VARCHAR(100),
    fecha_licencia DATE,
    CONSTRAINT vuelos_trimestre_check CHECK (
        trimestre IS NULL OR (trimestre >= 1 AND trimestre <= 4)
    )
);

CREATE TABLE IF NOT EXISTS public.cursos (
    id BIGSERIAL PRIMARY KEY,
    nombre_curso VARCHAR(200),
    institucion VARCHAR(200),
    boletin VARCHAR(50),
    numero_orden VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS public.viviendas_servicio (
    id BIGSERIAL PRIMARY KEY,
    direccion VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS public.retiros (
    id BIGSERIAL PRIMARY KEY,
    persona_id BIGINT UNIQUE REFERENCES public.personas(id),
    fecha_retiro DATE,
    hora_retiro TIME,
    motivo TEXT
);

CREATE TABLE IF NOT EXISTS public.relaciones_familiares (
    persona_id BIGINT NOT NULL REFERENCES public.personas(id),
    familiar_id BIGINT NOT NULL REFERENCES public.personas(id),
    tipo_relacion VARCHAR(50),
    observaciones TEXT,
    PRIMARY KEY (persona_id, familiar_id),
    CONSTRAINT relaciones_familiares_distintas_check CHECK (persona_id <> familiar_id)
);

CREATE TABLE IF NOT EXISTS public.asignaciones_funcionario (
    id BIGSERIAL PRIMARY KEY,
    persona_id BIGINT REFERENCES public.personas(id),
    destino_id BIGINT REFERENCES public.destinos(id),
    fecha_inicio DATE,
    fecha_fin DATE,
    posicion_destino VARCHAR(200),
    observaciones TEXT
);

CREATE TABLE IF NOT EXISTS public.funcionarios_misiones (
    persona_id BIGINT REFERENCES public.personas(id),
    mision_id BIGINT REFERENCES public.misiones(id),
    boletin VARCHAR(50),
    observaciones TEXT,
    numero_control_migratorio VARCHAR(100),
    PRIMARY KEY (persona_id, mision_id)
);

CREATE TABLE IF NOT EXISTS public.funcionarios_vuelos (
    persona_id BIGINT REFERENCES public.personas(id),
    vuelo_id BIGINT REFERENCES public.vuelos(id),
    PRIMARY KEY (persona_id, vuelo_id)
);

CREATE TABLE IF NOT EXISTS public.funcionarios_cursos (
    persona_id BIGINT REFERENCES public.personas(id),
    curso_id BIGINT REFERENCES public.cursos(id),
    fecha_inicio DATE,
    fecha_fin DATE,
    calificacion TEXT,
    PRIMARY KEY (persona_id, curso_id)
);

CREATE TABLE IF NOT EXISTS public.modulos_curso (
    id BIGSERIAL PRIMARY KEY,
    curso_id BIGINT REFERENCES public.cursos(id) ON DELETE CASCADE,
    nombre_modulo VARCHAR(200) NOT NULL,
    orden_modulo INTEGER,
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS public.funcionarios_modulos_curso (
    persona_id BIGINT REFERENCES public.personas(id),
    modulo_id BIGINT REFERENCES public.modulos_curso(id),
    completado BOOLEAN DEFAULT FALSE,
    fecha_finalizacion DATE,
    calificacion TEXT,
    PRIMARY KEY (persona_id, modulo_id)
);

CREATE TABLE IF NOT EXISTS public.ascensos (
    id BIGSERIAL PRIMARY KEY,
    persona_id BIGINT REFERENCES public.personas(id),
    escalafon_id BIGINT,
    grado_id BIGINT,
    fecha_ascenso DATE,
    observaciones TEXT,
    FOREIGN KEY (escalafon_id, grado_id)
        REFERENCES public.escalafones_grados(escalafon_id, grado_id)
);

CREATE TABLE IF NOT EXISTS public.ocupaciones_vivienda (
    persona_id BIGINT REFERENCES public.personas(id),
    vivienda_id BIGINT REFERENCES public.viviendas_servicio(id),
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    PRIMARY KEY (persona_id, vivienda_id)
);

CREATE TABLE IF NOT EXISTS public.bitacora_cambios (
    id BIGSERIAL PRIMARY KEY,
    fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT now(),
    tabla_nombre TEXT NOT NULL,
    clave_primaria TEXT NOT NULL,
    usuario_id TEXT,
    operacion TEXT NOT NULL,
    nombre_columna TEXT,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    notas TEXT
);

COMMIT;

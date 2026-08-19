-- ============================================================================
-- MIGRACIÓN DE INTEGRACIÓN: Sistema de Gestión de Personal (pfg-backend)
--
-- Prerrequisito: schema de producción de liquidaciones ya aplicado
--                (schema_20260720_163816.sql)
--
-- Este script agrega ÚNICAMENTE las estructuras necesarias para que el sistema
-- de gestión de personal funcione en paralelo con el de liquidaciones, sin
-- modificar ni eliminar nada existente.
--
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 1: Columnas nuevas en tablas compartidas
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1.1 personas ───────────────────────────────────────────────────────────
-- Columnas de datos personales extendidos para gestión de personal.
-- Todas nullable, no afectan registros existentes.

ALTER TABLE public.personas
    ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(200),
    ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
    ADD COLUMN IF NOT EXISTS etnia VARCHAR(50),
    ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(50),
    ADD COLUMN IF NOT EXISTS seccional VARCHAR(100),
    ADD COLUMN IF NOT EXISTS foto BYTEA,
    ADD COLUMN IF NOT EXISTS fecha_fallecimiento DATE,
    ADD COLUMN IF NOT EXISTS es_civil BOOLEAN DEFAULT FALSE;

-- ─── 1.2 relaciones_laborales ───────────────────────────────────────────────
-- Datos de carrera militar/civil que el módulo de personal necesita.
-- Todas nullable, no afectan registros existentes.

ALTER TABLE public.relaciones_laborales
    ADD COLUMN IF NOT EXISTS tipo_funcionario VARCHAR(20),
    ADD COLUMN IF NOT EXISTS tiene_mando BOOLEAN,
    ADD COLUMN IF NOT EXISTS mutaciones TEXT,
    ADD COLUMN IF NOT EXISTS conducta TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'relaciones_laborales_tipo_funcionario_check'
          AND conrelid = 'public.relaciones_laborales'::regclass
    ) THEN
        ALTER TABLE public.relaciones_laborales
            ADD CONSTRAINT relaciones_laborales_tipo_funcionario_check
            CHECK (tipo_funcionario IS NULL OR tipo_funcionario IN ('subalterno', 'oficial'));
    END IF;
END $$;

-- ─── 1.3 usuarios ──────────────────────────────────────────────────────────
-- Multi-tenancy: distinguir usuarios de cada aplicación.
-- Invalidación de sesiones para cuando cambian roles/permisos.

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS aplicacion VARCHAR(20) NOT NULL DEFAULT 'liquidacion';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'usuarios_aplicacion_check'
          AND conrelid = 'public.usuarios'::regclass
    ) THEN
        ALTER TABLE public.usuarios
            ADD CONSTRAINT usuarios_aplicacion_check
            CHECK (aplicacion IN ('personal', 'liquidacion'));
    END IF;
END $$;

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS sesiones_invalidas_desde TIMESTAMP NULL;

-- Cambiar unique de username simple a (username, aplicacion) para multi-tenancy.
-- Esto permite que exista "admin" en liquidacion y "admin" en personal.
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_username_key;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_username_aplicacion_key') THEN
        ALTER TABLE public.usuarios
            ADD CONSTRAINT usuarios_username_aplicacion_key UNIQUE (username, aplicacion);
    END IF;
END $$;

-- ─── 1.4 roles ─────────────────────────────────────────────────────────────
-- Multi-tenancy: cada aplicación tiene su propio conjunto de roles.

ALTER TABLE public.roles
    ADD COLUMN IF NOT EXISTS aplicacion VARCHAR(20) NOT NULL DEFAULT 'liquidacion';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'roles_aplicacion_check'
          AND conrelid = 'public.roles'::regclass
    ) THEN
        ALTER TABLE public.roles
            ADD CONSTRAINT roles_aplicacion_check
            CHECK (aplicacion IN ('personal', 'liquidacion'));
    END IF;
END $$;

-- Cambiar unique de nombre simple a (nombre, aplicacion).
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_nombre_key;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_nombre_aplicacion_key') THEN
        ALTER TABLE public.roles
            ADD CONSTRAINT roles_nombre_aplicacion_key UNIQUE (nombre, aplicacion);
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 2: Tablas nuevas — Autenticación y Autorización
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 2.1 permisos ───────────────────────────────────────────────────────────
-- Catálogo de permisos granulares por aplicación.

CREATE TABLE IF NOT EXISTS public.permisos (
    id          BIGSERIAL PRIMARY KEY,
    nombre      VARCHAR(60) NOT NULL,
    descripcion VARCHAR(200),
    aplicacion  VARCHAR(20) NOT NULL DEFAULT 'liquidacion'
        CHECK (aplicacion IN ('personal', 'liquidacion'))
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permisos_nombre_aplicacion_key') THEN
        ALTER TABLE public.permisos
            ADD CONSTRAINT permisos_nombre_aplicacion_key UNIQUE (nombre, aplicacion);
    END IF;
END $$;

-- ─── 2.2 roles_permisos ────────────────────────────────────────────────────
-- Vincula roles con permisos (N:M).

CREATE TABLE IF NOT EXISTS public.roles_permisos (
    permiso_id BIGINT NOT NULL REFERENCES public.permisos(id),
    rol_id     BIGINT NOT NULL REFERENCES public.roles(id),
    PRIMARY KEY (permiso_id, rol_id)
);

-- ─── 2.3 unidades_roles ────────────────────────────────────────────────────
-- Roles heredados por unidad organizativa. Los usuarios de una unidad
-- heredan estos roles además de los asignados directamente.

CREATE TABLE IF NOT EXISTS public.unidades_roles (
    unidad_id BIGINT NOT NULL REFERENCES public.unidades(id),
    rol_id    BIGINT NOT NULL REFERENCES public.roles(id),
    PRIMARY KEY (unidad_id, rol_id)
);

CREATE INDEX IF NOT EXISTS idx_unidades_roles_rol ON public.unidades_roles (rol_id);

-- ─── 2.4 usuarios_unidades ─────────────────────────────────────────────────
-- Relación N:M entre usuarios y unidades. Un usuario puede pertenecer a
-- múltiples unidades y ver/gestionar datos de todas ellas simultáneamente.

CREATE TABLE IF NOT EXISTS public.usuarios_unidades (
    usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id),
    unidad_id  BIGINT NOT NULL REFERENCES public.unidades(id),
    PRIMARY KEY (usuario_id, unidad_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_unidades_unidad ON public.usuarios_unidades (unidad_id);

-- ─── 2.5 invitaciones ──────────────────────────────────────────────────────
-- Sistema de invitación para creación de cuentas de usuario.

CREATE TABLE IF NOT EXISTS public.invitaciones (
    id          BIGSERIAL PRIMARY KEY,
    email       VARCHAR(150) NOT NULL,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    persona_id  BIGINT REFERENCES public.personas(id),
    roles       TEXT[] NOT NULL DEFAULT '{}',
    estado      VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    creado_por  BIGINT NOT NULL REFERENCES public.usuarios(id),
    creado_en   TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    expira_en   TIMESTAMP(6) NOT NULL,
    usado_en    TIMESTAMP(6)
);

-- ─── 2.5 tokens_reset_password ─────────────────────────────────────────────
-- Tokens para flujo de reset de contraseña.

CREATE TABLE IF NOT EXISTS public.tokens_reset_password (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL REFERENCES public.usuarios(id),
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    usado       BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en   TIMESTAMP(6) NOT NULL DEFAULT NOW(),
    expira_en   TIMESTAMP(6) NOT NULL,
    usado_en    TIMESTAMP(6)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 3: Tablas nuevas — Dominio de Gestión de Personal
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 3.1 misiones ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.misiones (
    id                   BIGSERIAL PRIMARY KEY,
    nombre_mision        VARCHAR(200),
    pais                 VARCHAR(100),
    tipo_mision          VARCHAR(100),
    fecha_salida         DATE,
    fecha_llegada        DATE,
    numero_orden         VARCHAR(50),
    boletin              VARCHAR(50),
    observaciones        TEXT,
    comando_responsable  VARCHAR(200)
);

-- ─── 3.2 convocatorias ─────────────────────────────────────────────────────
-- Instancia de una misión en un momento concreto.

CREATE TABLE IF NOT EXISTS public.convocatorias (
    id            BIGSERIAL PRIMARY KEY,
    mision_id     BIGINT NOT NULL REFERENCES public.misiones(id) ON DELETE CASCADE,
    numero_orden  VARCHAR(50),
    boletin       VARCHAR(50),
    fecha_salida  DATE,
    fecha_llegada DATE,
    observaciones TEXT
);

-- ─── 3.3 funcionarios_convocatorias ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.funcionarios_convocatorias (
    id              BIGSERIAL PRIMARY KEY,
    convocatoria_id BIGINT NOT NULL REFERENCES public.convocatorias(id) ON DELETE CASCADE,
    persona_id      BIGINT NOT NULL REFERENCES public.personas(id),
    numero_orden    VARCHAR(50),
    boletin         VARCHAR(50),
    observaciones   TEXT,
    UNIQUE (convocatoria_id, persona_id)
);

-- ─── 3.4 funcionarios_misiones (legacy, compatibilidad) ────────────────────

CREATE TABLE IF NOT EXISTS public.funcionarios_misiones (
    persona_id              BIGINT REFERENCES public.personas(id),
    mision_id               BIGINT REFERENCES public.misiones(id),
    boletin                 VARCHAR(50),
    observaciones           TEXT,
    numero_control_migratorio VARCHAR(100),
    PRIMARY KEY (persona_id, mision_id)
);

-- ─── 3.5 destinos ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.destinos (
    id           BIGSERIAL PRIMARY KEY,
    ubicacion    VARCHAR(200),
    numero_orden VARCHAR(50),
    tipo_destino VARCHAR(100)
);

-- ─── 3.6 asignaciones_funcionario ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.asignaciones_funcionario (
    id               BIGSERIAL PRIMARY KEY,
    persona_id       BIGINT REFERENCES public.personas(id),
    destino_id       BIGINT REFERENCES public.destinos(id),
    fecha_inicio     DATE,
    fecha_fin        DATE,
    posicion_destino VARCHAR(200),
    observaciones    TEXT
);

-- ─── 3.7 vuelos ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vuelos (
    id                    BIGSERIAL PRIMARY KEY,
    anio                  INTEGER,
    trimestre             INTEGER,
    tipo_aeronave         VARCHAR(100),
    modelo_aeronave       VARCHAR(100),
    funcion               VARCHAR(100),
    horas_vuelo           NUMERIC(10, 2),
    horas_vuelo_ficticias NUMERIC(10, 2),
    horas_totales         NUMERIC(10, 2),
    tipo_licencia         VARCHAR(100),
    fecha_licencia        DATE,
    CONSTRAINT vuelos_trimestre_check CHECK (
        trimestre IS NULL OR (trimestre >= 1 AND trimestre <= 4)
    )
);

-- ─── 3.8 funcionarios_vuelos ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.funcionarios_vuelos (
    persona_id BIGINT REFERENCES public.personas(id),
    vuelo_id   BIGINT REFERENCES public.vuelos(id),
    PRIMARY KEY (persona_id, vuelo_id)
);

-- ─── 3.9 cursos ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cursos (
    id             BIGSERIAL PRIMARY KEY,
    nombre_curso   VARCHAR(200),
    institucion    VARCHAR(200),
    es_obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
    unidad_id      BIGINT REFERENCES public.unidades(id)
);

CREATE INDEX IF NOT EXISTS idx_cursos_unidad ON public.cursos (unidad_id);

-- ─── 3.10 funcionarios_cursos ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.funcionarios_cursos (
    id              BIGSERIAL PRIMARY KEY,
    persona_id      BIGINT NOT NULL REFERENCES public.personas(id),
    curso_id        BIGINT NOT NULL REFERENCES public.cursos(id),
    numero_orden    VARCHAR(50),
    boletin         VARCHAR(50),
    fecha_inicio    DATE,
    fecha_fin       DATE,
    calificacion    TEXT,
    dado_de_baja    BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_baja     TEXT,
    fecha_baja      TIMESTAMPTZ,
    dado_de_baja_por BIGINT REFERENCES public.usuarios(id),
    UNIQUE (persona_id, curso_id)
);

-- ─── 3.11 modulos_curso ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.modulos_curso (
    id            BIGSERIAL PRIMARY KEY,
    curso_id      BIGINT REFERENCES public.cursos(id) ON DELETE CASCADE,
    nombre_modulo VARCHAR(200) NOT NULL,
    orden_modulo  INTEGER,
    descripcion   TEXT
);

-- ─── 3.12 funcionarios_modulos_curso ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.funcionarios_modulos_curso (
    id                   BIGSERIAL PRIMARY KEY,
    funcionario_curso_id BIGINT NOT NULL REFERENCES public.funcionarios_cursos(id) ON DELETE CASCADE,
    modulo_id            BIGINT NOT NULL REFERENCES public.modulos_curso(id),
    numero_orden         VARCHAR(50),
    boletin              VARCHAR(50),
    completado           BOOLEAN DEFAULT FALSE,
    fecha_finalizacion   DATE,
    calificacion         TEXT,
    UNIQUE (funcionario_curso_id, modulo_id)
);

-- ─── 3.13 viviendas_servicio ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.viviendas_servicio (
    id        BIGSERIAL PRIMARY KEY,
    direccion VARCHAR(255)
);

-- ─── 3.14 ocupaciones_vivienda ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ocupaciones_vivienda (
    persona_id  BIGINT REFERENCES public.personas(id),
    vivienda_id BIGINT REFERENCES public.viviendas_servicio(id),
    fecha_inicio DATE NOT NULL,
    fecha_fin    DATE,
    PRIMARY KEY (persona_id, vivienda_id)
);

-- ─── 3.15 retiros ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.retiros (
    id         BIGSERIAL PRIMARY KEY,
    persona_id BIGINT UNIQUE REFERENCES public.personas(id),
    fecha_retiro DATE,
    hora_retiro  TIME,
    motivo       TEXT
);

-- ─── 3.16 relaciones_familiares ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.relaciones_familiares (
    persona_id    BIGINT NOT NULL REFERENCES public.personas(id),
    familiar_id   BIGINT NOT NULL REFERENCES public.personas(id),
    tipo_relacion VARCHAR(50),
    observaciones TEXT,
    PRIMARY KEY (persona_id, familiar_id),
    CONSTRAINT relaciones_familiares_distintas_check CHECK (persona_id <> familiar_id)
);

-- ─── 3.17 ascensos ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ascensos (
    id            BIGSERIAL PRIMARY KEY,
    persona_id    BIGINT REFERENCES public.personas(id),
    grado_id      BIGINT REFERENCES public.grados(id),
    fecha_ascenso DATE,
    observaciones TEXT
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 4: Índices adicionales
-- ═══════════════════════════════════════════════════════════════════════════════

-- Optimizar búsqueda de personal activo por unidad (para alcance por unidad)
CREATE INDEX IF NOT EXISTS idx_relaciones_laborales_unidad_activa
    ON public.relaciones_laborales (unidad_id)
    WHERE fecha_fin IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 5: Extensiones requeridas
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMIT;

-- ============================================================================
-- FIN DE MIGRACIÓN DDL
-- ============================================================================

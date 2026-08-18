-- =====================================================================
-- Migración incremental: fusión con schema final del proyecto FAU
-- (schema_20260720_163816.sql, entregado 2026-08-10)
-- Generada 2026-08-13. Ejecutar sobre la base compartida real.
--
-- Esta migración lleva la base actual al schema fusionado que ya quedó
-- reflejado en pfg-backend/database/scripts/schema.sql y en
-- pfg-backend/backend/prisma/schema.prisma.
--
-- IMPORTANTE: ningún código del backend usa hoy las columnas/tablas que
-- se agregan o quitan acá (confirmado por búsqueda en backend/src y
-- database/scripts), por lo que es segura de aplicar. Los dos únicos
-- puntos marcados "REVISAR DATOS" abajo requieren decisión humana antes
-- de dropear columnas viejas, porque implican convertir datos existentes.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. aguinaldos: nuevo desglose tipo recibo (reemplaza irpf_aguinaldo/liquidacion_id)
-- ---------------------------------------------------------------------
ALTER TABLE public.aguinaldos
    ADD COLUMN IF NOT EXISTS nominal          numeric(14,2),
    ADD COLUMN IF NOT EXISTS montepio         numeric(14,2),
    ADD COLUMN IF NOT EXISTS sanidad          numeric(14,2),
    ADD COLUMN IF NOT EXISTS total_descuentos numeric(14,2),
    ADD COLUMN IF NOT EXISTS liquido          numeric(14,2),
    ADD COLUMN IF NOT EXISTS redondeo         numeric(14,2) DEFAULT 0 NOT NULL;

-- REVISAR DATOS: si aguinaldos.irpf_aguinaldo/liquidacion_id ya tienen datos,
-- decidir si se recalculan los nuevos campos antes de dropear. No hay código
-- que dependa de las columnas viejas hoy, así que el drop es seguro a nivel app.
ALTER TABLE public.aguinaldos DROP CONSTRAINT IF EXISTS aguinaldos_liquidacion_id_fkey;
ALTER TABLE public.aguinaldos DROP COLUMN IF EXISTS liquidacion_id;
ALTER TABLE public.aguinaldos DROP COLUMN IF EXISTS irpf_aguinaldo;

-- ---------------------------------------------------------------------
-- 2. tabla_permanencia: años -> meses, ahora ligado a grado_id
-- ---------------------------------------------------------------------
ALTER TABLE public.tabla_permanencia
    ADD COLUMN IF NOT EXISTS grado_id            bigint,
    ADD COLUMN IF NOT EXISTS meses_desde         smallint DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS meses_hasta         smallint,
    ADD COLUMN IF NOT EXISTS aplica_riesgo_vuelo boolean DEFAULT false NOT NULL;

-- REVISAR DATOS: si hay filas existentes, completar grado_id (antes no tenía
-- relación a grado) y convertir anios_desde/anios_hasta -> meses (*12) antes
-- de fijar meses_hasta NOT NULL y dropear las columnas en años. Ejemplo:
--   UPDATE public.tabla_permanencia SET meses_desde = anios_desde * 12, meses_hasta = anios_hasta * 12;
--   UPDATE public.tabla_permanencia SET grado_id = <mapeo manual por escalafon_id>;
-- Una vez completado:
--   ALTER TABLE public.tabla_permanencia ALTER COLUMN meses_hasta SET NOT NULL;
--   ALTER TABLE public.tabla_permanencia ALTER COLUMN grado_id SET NOT NULL;
--   ALTER TABLE public.tabla_permanencia ADD CONSTRAINT tabla_permanencia_grado_id_fkey FOREIGN KEY (grado_id) REFERENCES public.grados(id);
--   ALTER TABLE public.tabla_permanencia DROP COLUMN anios_desde, DROP COLUMN anios_hasta;
-- No se ejecuta automáticamente porque no hay código ni datos que permitan
-- inferir el grado_id correcto por fila.

-- ---------------------------------------------------------------------
-- 3. lotes_compensacion: periodo (date) -> periodo_id (FK a periodos_liquidacion)
-- ---------------------------------------------------------------------
ALTER TABLE public.lotes_compensacion
    ADD COLUMN IF NOT EXISTS periodo_id bigint;

-- REVISAR DATOS: completar periodo_id buscando el periodos_liquidacion con
-- mismo (anio, mes) que la columna periodo actual, por ejemplo:
--   UPDATE public.lotes_compensacion lc
--   SET periodo_id = pl.id
--   FROM public.periodos_liquidacion pl
--   WHERE pl.anio = EXTRACT(YEAR FROM lc.periodo) AND pl.mes = EXTRACT(MONTH FROM lc.periodo);
-- Luego:
--   ALTER TABLE public.lotes_compensacion ALTER COLUMN periodo_id SET NOT NULL;
--   ALTER TABLE public.lotes_compensacion ADD CONSTRAINT fk_lotes_compensacion_periodo FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id);
--   DROP INDEX IF EXISTS uix_lotes_tipo_periodo;
--   ALTER TABLE public.lotes_compensacion DROP COLUMN periodo;
CREATE INDEX IF NOT EXISTS ix_lotes_compensacion_periodo_id ON public.lotes_compensacion USING btree (periodo_id);

-- ---------------------------------------------------------------------
-- 4. periodos_liquidacion: nuevos pasos de flujo (descuentos personales, envío MDN)
-- ---------------------------------------------------------------------
ALTER TABLE public.periodos_liquidacion
    ALTER COLUMN estado TYPE character varying(30),
    ADD COLUMN IF NOT EXISTS fecha_envio_mdn timestamp without time zone,
    ADD COLUMN IF NOT EXISTS usuario_envio_mdn bigint,
    ADD COLUMN IF NOT EXISTS fecha_descuentos_personales timestamp without time zone,
    ADD COLUMN IF NOT EXISTS usuario_descuentos_personales bigint;

DO $$ BEGIN
    ALTER TABLE public.periodos_liquidacion
        ADD CONSTRAINT periodos_liquidacion_usuario_envio_mdn_fkey FOREIGN KEY (usuario_envio_mdn) REFERENCES public.usuarios(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.periodos_liquidacion
        ADD CONSTRAINT periodos_liquidacion_usuario_descuentos_personales_fkey FOREIGN KEY (usuario_descuentos_personales) REFERENCES public.usuarios(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 5. form3100: deducción profesional (Caja Profesional / CAPPU)
-- ---------------------------------------------------------------------
ALTER TABLE public.form3100
    ADD COLUMN IF NOT EXISTS cappu_importe    numeric(14,2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS reintegro_aporte numeric(14,2) DEFAULT 0 NOT NULL;

-- ---------------------------------------------------------------------
-- 6. bitacora_auditoria: columna aplicacion (personal/liquidacion)
--    (puede ya existir si el equipo la agregó manualmente; el schema.sql
--    viejo no la tenía pero prisma/schema.prisma sí, por eso el guard)
-- ---------------------------------------------------------------------
ALTER TABLE public.bitacora_auditoria
    ADD COLUMN IF NOT EXISTS aplicacion character varying(20) DEFAULT 'liquidacion' NOT NULL;

DO $$ BEGIN
    ALTER TABLE public.bitacora_auditoria
        ADD CONSTRAINT bitacora_auditoria_aplicacion_check CHECK (((aplicacion)::text = ANY (ARRAY[('personal'::character varying)::text, ('liquidacion'::character varying)::text])));
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 7. parametros_periodo: tasa de tutela social
-- ---------------------------------------------------------------------
ALTER TABLE public.parametros_periodo
    ADD COLUMN IF NOT EXISTS tasa_tutela_social numeric(5,4) DEFAULT 0.01 NOT NULL;

-- ---------------------------------------------------------------------
-- 8. relaciones_laborales: nuevos datos de relación laboral
-- ---------------------------------------------------------------------
ALTER TABLE public.relaciones_laborales
    ADD COLUMN IF NOT EXISTS anios_servicio_anterior smallint DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS categoria_viatico       smallint DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS usa_fonasa              boolean DEFAULT false NOT NULL;

-- ---------------------------------------------------------------------
-- 9. remuneraciones_grado: grupo de remuneración
-- ---------------------------------------------------------------------
ALTER TABLE public.remuneraciones_grado
    ADD COLUMN IF NOT EXISTS grupo_remuneracion character varying(20);

-- ---------------------------------------------------------------------
-- 10. acreedores: índice nuevo (sin cambio de columnas)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_acreedores_orden_legal_deficit ON public.acreedores USING btree (orden_legal_deficit);

-- ---------------------------------------------------------------------
-- 11. Tablas nuevas del módulo de liquidación (FAU)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aguinaldo_baja (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    cedula character varying(20) NOT NULL,
    nombre_completo character varying(150) NOT NULL,
    fecha_baja date NOT NULL,
    motivo_baja_codigo character varying(20),
    anio smallint NOT NULL,
    mes smallint NOT NULL,
    semestre smallint NOT NULL,
    total_haberes_gravados numeric(14,2) NOT NULL,
    meses_computados smallint NOT NULL,
    mes_inicio_periodo smallint,
    mes_fin_periodo smallint,
    mes_liquidacion smallint,
    nominal numeric(14,2) NOT NULL,
    montepio numeric(14,2) NOT NULL,
    sanidad numeric(14,2) NOT NULL,
    total_descuentos numeric(14,2) NOT NULL,
    liquido numeric(14,2) NOT NULL,
    redondeo numeric(14,2) DEFAULT 0 NOT NULL,
    estado character varying(20) NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.aguinaldo_baja_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.aguinaldo_baja_id_seq OWNED BY public.aguinaldo_baja.id;
ALTER TABLE ONLY public.aguinaldo_baja ALTER COLUMN id SET DEFAULT nextval('public.aguinaldo_baja_id_seq'::regclass);
DO $$ BEGIN
    ALTER TABLE ONLY public.aguinaldo_baja ADD CONSTRAINT aguinaldo_baja_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.aguinaldo_baja ADD CONSTRAINT aguinaldo_baja_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_aguinaldo_baja_persona_fecha_baja ON public.aguinaldo_baja USING btree (persona_id, fecha_baja);
CREATE INDEX IF NOT EXISTS idx_aguinaldo_baja_anio_mes ON public.aguinaldo_baja USING btree (anio, mes);
CREATE INDEX IF NOT EXISTS idx_aguinaldo_baja_estado ON public.aguinaldo_baja USING btree (estado);

CREATE TABLE IF NOT EXISTS public.items_aguinaldo_baja (
    id bigint NOT NULL,
    aguinaldo_baja_id bigint NOT NULL,
    codigo_concepto character varying(20) NOT NULL,
    nombre_concepto character varying(150) NOT NULL,
    importe numeric(14,2) NOT NULL,
    tipo character varying(20) NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.items_aguinaldo_baja_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.items_aguinaldo_baja_id_seq OWNED BY public.items_aguinaldo_baja.id;
ALTER TABLE ONLY public.items_aguinaldo_baja ALTER COLUMN id SET DEFAULT nextval('public.items_aguinaldo_baja_id_seq'::regclass);
DO $$ BEGIN
    ALTER TABLE ONLY public.items_aguinaldo_baja ADD CONSTRAINT items_aguinaldo_baja_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.items_aguinaldo_baja ADD CONSTRAINT items_aguinaldo_baja_aguinaldo_baja_id_fkey FOREIGN KEY (aguinaldo_baja_id) REFERENCES public.aguinaldo_baja(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_items_aguinaldo_baja_aguinaldo ON public.items_aguinaldo_baja USING btree (aguinaldo_baja_id);
CREATE INDEX IF NOT EXISTS idx_items_aguinaldo_baja_tipo ON public.items_aguinaldo_baja USING btree (tipo);

CREATE TABLE IF NOT EXISTS public.comp_personal_048018 (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    importe numeric(14,2) NOT NULL,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    creado_por bigint,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.comp_personal_048018_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.comp_personal_048018_id_seq OWNED BY public.comp_personal_048018.id;
ALTER TABLE ONLY public.comp_personal_048018 ALTER COLUMN id SET DEFAULT nextval('public.comp_personal_048018_id_seq'::regclass);
DO $$ BEGIN
    ALTER TABLE ONLY public.comp_personal_048018 ADD CONSTRAINT comp_personal_048018_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.comp_personal_048018 ADD CONSTRAINT comp_personal_048018_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.comp_personal_048018 ADD CONSTRAINT comp_personal_048018_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ix_comp_personal_048018_vigencia ON public.comp_personal_048018 USING btree (persona_id, estado, vigente_desde);

CREATE TABLE IF NOT EXISTS public.fictos_persona (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    acreedor_id bigint NOT NULL,
    catalogo_item_id bigint NOT NULL,
    importe numeric(14,2) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    observaciones text,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL,
    fecha_modificacion timestamp with time zone,
    fecha_baja timestamp with time zone,
    usuario_creacion_id bigint,
    usuario_modificacion_id bigint,
    usuario_baja_id bigint
);
CREATE SEQUENCE IF NOT EXISTS public.fictos_persona_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.fictos_persona_id_seq OWNED BY public.fictos_persona.id;
ALTER TABLE ONLY public.fictos_persona ALTER COLUMN id SET DEFAULT nextval('public.fictos_persona_id_seq'::regclass);
DO $$ BEGIN
    ALTER TABLE ONLY public.fictos_persona ADD CONSTRAINT fictos_persona_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.fictos_persona ADD CONSTRAINT uq_fictos_persona_persona_catalogo UNIQUE (persona_id, catalogo_item_id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.fictos_persona ADD CONSTRAINT fictos_persona_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.fictos_persona ADD CONSTRAINT fictos_persona_acreedor_id_fkey FOREIGN KEY (acreedor_id) REFERENCES public.acreedores(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.fictos_persona ADD CONSTRAINT fictos_persona_catalogo_item_id_fkey FOREIGN KEY (catalogo_item_id) REFERENCES public.catalogo_items(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.fictos_persona ADD CONSTRAINT fictos_persona_usuario_creacion_id_fkey FOREIGN KEY (usuario_creacion_id) REFERENCES public.usuarios(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.fictos_persona ADD CONSTRAINT fictos_persona_usuario_modificacion_id_fkey FOREIGN KEY (usuario_modificacion_id) REFERENCES public.usuarios(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.fictos_persona ADD CONSTRAINT fictos_persona_usuario_baja_id_fkey FOREIGN KEY (usuario_baja_id) REFERENCES public.usuarios(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ix_fictos_persona_activo_persona ON public.fictos_persona USING btree (activo, persona_id);
CREATE INDEX IF NOT EXISTS ix_fictos_persona_catalogo ON public.fictos_persona USING btree (catalogo_item_id);

CREATE TABLE IF NOT EXISTS public.historico_liquidaciones (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    anio smallint NOT NULL,
    mes smallint NOT NULL,
    haberes_gravados numeric(14,2) NOT NULL,
    origen character varying(20) DEFAULT 'SISTEMA'::character varying NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS public.historico_liquidaciones_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.historico_liquidaciones_id_seq OWNED BY public.historico_liquidaciones.id;
ALTER TABLE ONLY public.historico_liquidaciones ALTER COLUMN id SET DEFAULT nextval('public.historico_liquidaciones_id_seq'::regclass);
DO $$ BEGIN
    ALTER TABLE ONLY public.historico_liquidaciones ADD CONSTRAINT historico_liquidaciones_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.historico_liquidaciones ADD CONSTRAINT uq_historico_persona_anio_mes UNIQUE (persona_id, anio, mes);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE ONLY public.historico_liquidaciones ADD CONSTRAINT historico_liquidaciones_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);
EXCEPTION WHEN duplicate_object OR invalid_table_definition OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ix_historico_anio_mes ON public.historico_liquidaciones USING btree (anio, mes);
CREATE INDEX IF NOT EXISTS ix_historico_persona_id ON public.historico_liquidaciones USING btree (persona_id);

-- ---------------------------------------------------------------------
-- Nota: NO se toca permisos ni roles_permisos: son propias de nuestro
-- módulo de RBAC, ya existen en la base real y el schema_20260720_163816.sql
-- que nos pasó el otro equipo nunca las tuvo. pfg-backend/database/scripts/schema.sql
-- y prisma/schema.prisma ya las conservan tal cual estaban.
-- ---------------------------------------------------------------------

COMMIT;

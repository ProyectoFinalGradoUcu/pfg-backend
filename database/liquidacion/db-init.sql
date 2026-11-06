--
-- PostgreSQL database dump
--

\restrict zB8hiFFMQzsMa4AlfweIdjCMOgqIKcQ6txoLxxKzH8d8juxGcpnP7hHVDNav0Cc

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: marcar_migracion_exitosa(character varying, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_migracion_exitosa(p_version character varying, p_tiempo_ms integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE schema_migrations
    SET estado = 'SUCCESS', tiempo_ejecucion_ms = p_tiempo_ms, ejecutado_en = CURRENT_TIMESTAMP
    WHERE version = p_version;
END;
$$;


--
-- Name: marcar_migracion_fallida(character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_migracion_fallida(p_version character varying, p_error text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE schema_migrations
    SET estado = 'FAILED', error_mensaje = p_error, ejecutado_en = CURRENT_TIMESTAMP
    WHERE version = p_version;
END;
$$;


--
-- Name: migracion_ejecutada(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.migracion_ejecutada(p_version character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM schema_migrations WHERE version = p_version AND estado = 'SUCCESS'
    );
END;
$$;


--
-- Name: registrar_migracion(character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_migracion(p_version character varying, p_nombre character varying, p_checksum character varying DEFAULT NULL::character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: update_fecha_actualizacion_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_fecha_actualizacion_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   NEW.fecha_actualizacion = now();
   RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acciones (
    id bigint NOT NULL,
    nombre character varying(60) NOT NULL,
    descripcion character varying(200)
);


--
-- Name: acciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acciones_id_seq OWNED BY public.acciones.id;


--
-- Name: acreedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acreedores (
    id bigint NOT NULL,
    codigo character varying(20) NOT NULL,
    nombre character varying(150) NOT NULL,
    formato_archivo character varying(10) DEFAULT 'txt'::character varying,
    contacto character varying(200),
    activo boolean DEFAULT true NOT NULL,
    categoria_deficit character varying(60) DEFAULT 'otras_retenciones'::character varying NOT NULL,
    orden_legal_deficit smallint DEFAULT 100 NOT NULL,
    CONSTRAINT acreedores_formato_archivo_check CHECK (((formato_archivo)::text = ANY (ARRAY[('txt'::character varying)::text, ('csv'::character varying)::text, ('xlsx'::character varying)::text]))),
    CONSTRAINT ck_acreedores_categoria_deficit CHECK (((categoria_deficit)::text = ANY (ARRAY[('retencion_judicial_alimenticia'::character varying)::text, ('garantia_alquiler'::character varying)::text, ('cuota_sindical_partido'::character varying)::text, ('credito_social_brou'::character varying)::text, ('vivienda'::character varying)::text, ('seguro_vida'::character varying)::text, ('salud_prepaga'::character varying)::text, ('credito_nomina_cooperativa'::character varying)::text, ('facilidad_pago_tributaria'::character varying)::text, ('otras_retenciones'::character varying)::text])))
);


--
-- Name: TABLE acreedores; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.acreedores IS 'Catálogo de instituciones acreedoras (77+). prioridad_deficit: menor = mayor prioridad';


--
-- Name: acreedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acreedores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acreedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acreedores_id_seq OWNED BY public.acreedores.id;


--
-- Name: aguinaldo_baja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aguinaldo_baja (
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
    irpf numeric(14,2) NOT NULL,
    montepio numeric(14,2) NOT NULL,
    sanidad numeric(14,2) NOT NULL,
    total_descuentos numeric(14,2) NOT NULL,
    liquido numeric(14,2) NOT NULL,
    redondeo numeric(14,2) DEFAULT 0 NOT NULL,
    estado character varying(20) NOT NULL
);


--
-- Name: aguinaldo_baja_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aguinaldo_baja_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aguinaldo_baja_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aguinaldo_baja_id_seq OWNED BY public.aguinaldo_baja.id;


--
-- Name: aguinaldos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aguinaldos (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    anio smallint NOT NULL,
    semestre smallint NOT NULL,
    total_haberes_gravados_semestre numeric(14,2) NOT NULL,
    meses_trabajados smallint NOT NULL,
    irpf_aguinaldo numeric(14,2) DEFAULT 0 NOT NULL,
    nominal numeric(14,2),
    montepio numeric(14,2),
    sanidad numeric(14,2),
    total_descuentos numeric(14,2),
    liquido numeric(14,2),
    redondeo numeric(14,2) DEFAULT 0 NOT NULL,
    CONSTRAINT aguinaldos_meses_trabajados_check CHECK (((meses_trabajados >= 0) AND (meses_trabajados <= 6))),
    CONSTRAINT aguinaldos_semestre_check CHECK ((semestre = ANY (ARRAY[1, 2])))
);


--
-- Name: TABLE aguinaldos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.aguinaldos IS 'SAC semestral por persona. nominal = total_haberes_gravados_semestre / 12';


--
-- Name: aguinaldos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aguinaldos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aguinaldos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aguinaldos_id_seq OWNED BY public.aguinaldos.id;


--
-- Name: bancos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bancos (
    id bigint NOT NULL,
    codigo character varying(20) NOT NULL,
    nombre character varying(100) NOT NULL,
    vigente boolean DEFAULT true NOT NULL
);


--
-- Name: bancos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bancos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bancos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bancos_id_seq OWNED BY public.bancos.id;


--
-- Name: beneficio_social_beneficiarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beneficio_social_beneficiarios (
    id bigint NOT NULL,
    beneficio_id bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    cedula character varying(20),
    fecha_nacimiento date NOT NULL,
    discapacidad boolean DEFAULT false NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    activo boolean DEFAULT true NOT NULL,
    creado_por bigint,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_beneficio_beneficiario_vigencia CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))
);


--
-- Name: TABLE beneficio_social_beneficiarios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.beneficio_social_beneficiarios IS 'Personas a cargo que respaldan un beneficio social (hijos para asignación familiar, etc.)';


--
-- Name: beneficio_social_beneficiarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.beneficio_social_beneficiarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: beneficio_social_beneficiarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.beneficio_social_beneficiarios_id_seq OWNED BY public.beneficio_social_beneficiarios.id;


--
-- Name: beneficios_sociales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beneficios_sociales (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    tipo_beneficio_id bigint NOT NULL,
    cantidad smallint DEFAULT 1 NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    documento_respaldo character varying(200),
    observaciones text,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    creado_por bigint,
    fecha_evento date,
    clave_evento character varying(80),
    retroactividad_pendiente boolean DEFAULT false NOT NULL,
    subtipo character varying(20),
    CONSTRAINT beneficios_sociales_estado_check CHECK (((estado)::text = ANY (ARRAY[('activo'::character varying)::text, ('inactivo'::character varying)::text, ('pendiente_doc'::character varying)::text])))
);


--
-- Name: TABLE beneficios_sociales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.beneficios_sociales IS 'Beneficios sociales activos por persona (asig. familiar, hogar, primas nacimiento/matrimonio)';


--
-- Name: COLUMN beneficios_sociales.subtipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.beneficios_sociales.subtipo IS 'Subtipo para distinguir nacimiento/matrimonio en PRIMA_NACIMIENTO_MATRIMONIO';


--
-- Name: beneficios_sociales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.beneficios_sociales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: beneficios_sociales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.beneficios_sociales_id_seq OWNED BY public.beneficios_sociales.id;


--
-- Name: bitacora_auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bitacora_auditoria (
    id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    accion_id bigint NOT NULL,
    contexto_id bigint NOT NULL,
    host character varying(100),
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    entidad character varying(60),
    entidad_id bigint,
    detalle jsonb,
    aplicacion character varying(20) DEFAULT 'liquidacion'::character varying NOT NULL,
    CONSTRAINT bitacora_auditoria_aplicacion_check CHECK (((aplicacion)::text = ANY (ARRAY[('personal'::character varying)::text, ('liquidacion'::character varying)::text])))
);


--
-- Name: COLUMN bitacora_auditoria.entidad; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bitacora_auditoria.entidad IS 'Nombre de la entidad afectada (ej: Persona, Liquidacion)';


--
-- Name: COLUMN bitacora_auditoria.entidad_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bitacora_auditoria.entidad_id IS 'ID del registro afectado';


--
-- Name: COLUMN bitacora_auditoria.detalle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bitacora_auditoria.detalle IS 'Detalle de cambios en formato JSON';


--
-- Name: bitacora_auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bitacora_auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bitacora_auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bitacora_auditoria_id_seq OWNED BY public.bitacora_auditoria.id;


--
-- Name: catalogo_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogo_items (
    id bigint NOT NULL,
    codigo integer NOT NULL,
    nombre character varying(150) NOT NULL,
    tipo character varying(30) NOT NULL,
    es_gravado boolean DEFAULT true NOT NULL,
    contribuye_w_para_5_3 boolean DEFAULT false NOT NULL,
    contribuye_w_para_10 boolean DEFAULT false NOT NULL,
    contribuye_w_para_20 boolean DEFAULT false NOT NULL,
    contribuye_w_nominal boolean DEFAULT false NOT NULL,
    clasificacion_siif character varying(20),
    formula_calculo character varying(50),
    orden_calculo smallint DEFAULT 0 NOT NULL,
    item_par_ficto_id bigint,
    norma_legal character varying(100),
    acumula_aguinaldo boolean DEFAULT false NOT NULL,
    lleva_aumento boolean DEFAULT false NOT NULL,
    vigente boolean DEFAULT true NOT NULL,
    CONSTRAINT catalogo_items_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('haber_normal'::character varying)::text, ('haber_anual'::character varying)::text, ('haber_no_gravado'::character varying)::text, ('beneficio_social_grav'::character varying)::text, ('beneficio_social_no_grav'::character varying)::text, ('descuento_legal'::character varying)::text, ('descuento_personal'::character varying)::text, ('ficto_haber'::character varying)::text, ('ficto_descuento'::character varying)::text, ('ajuste'::character varying)::text])))
);


--
-- Name: TABLE catalogo_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.catalogo_items IS 'Maestro de códigos de ítem salarial con clasificación SIIF y flags de acumuladores';


--
-- Name: COLUMN catalogo_items.contribuye_w_nominal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalogo_items.contribuye_w_nominal IS 'True si el ítem contribuye a WNominal (suma de todos haberes grabados)';


--
-- Name: catalogo_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.catalogo_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catalogo_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.catalogo_items_id_seq OWNED BY public.catalogo_items.id;


--
-- Name: cierres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cierres (
    id bigint NOT NULL,
    liquidacion_id bigint NOT NULL,
    tipo character varying(20) DEFAULT 'mensual'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'en_proceso'::character varying NOT NULL,
    fecha_cierre timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cerrado_por bigint NOT NULL,
    hash_datos character varying(128),
    observaciones text,
    CONSTRAINT cierres_estado_check CHECK (((estado)::text = ANY (ARRAY[('en_proceso'::character varying)::text, ('completado'::character varying)::text, ('fallido'::character varying)::text]))),
    CONSTRAINT cierres_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('mensual'::character varying)::text, ('semestral'::character varying)::text, ('anual'::character varying)::text])))
);


--
-- Name: TABLE cierres; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cierres IS 'Control de cierre de período con hash de integridad SHA-256';


--
-- Name: cierres_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cierres_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cierres_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cierres_id_seq OWNED BY public.cierres.id;


--
-- Name: compensaciones_diferencia_ascenso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compensaciones_diferencia_ascenso (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    relacion_laboral_nueva_id bigint NOT NULL,
    periodo_id bigint,
    grado_viejo_id bigint NOT NULL,
    grado_nuevo_id bigint NOT NULL,
    monto numeric(14,2) NOT NULL,
    dias_desde_ascenso integer NOT NULL,
    tiene_permanencia boolean DEFAULT false NOT NULL,
    fecha_ascenso date NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    incidencias text,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT compensaciones_diferencia_ascenso_estado_check CHECK (((estado)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('aplicado'::character varying)::text, ('anulado'::character varying)::text])))
);


--
-- Name: TABLE compensaciones_diferencia_ascenso; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.compensaciones_diferencia_ascenso IS 'Diferencias de haberes por ascensos Sdo.1ra→Cbo.2da y Cbo.1ra→Sgto (OG 042.615)';


--
-- Name: compensaciones_diferencia_ascenso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compensaciones_diferencia_ascenso_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compensaciones_diferencia_ascenso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compensaciones_diferencia_ascenso_id_seq OWNED BY public.compensaciones_diferencia_ascenso.id;


--
-- Name: config_compensaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_compensaciones (
    id bigint NOT NULL,
    tipo_compensacion_id bigint NOT NULL,
    regimen_id bigint,
    grado_id bigint,
    escalafon_id bigint,
    funcion character varying(50),
    unidad_medida character varying(10) NOT NULL,
    formula character varying(30) NOT NULL,
    valor_por_unidad numeric(14,2),
    monto numeric(14,2),
    tope numeric(14,2),
    tope_unidades smallint,
    valor_minimo numeric(14,2),
    valor_maximo numeric(14,2),
    sujeto_desc_legales boolean DEFAULT false NOT NULL,
    catalogo_item_id bigint,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT config_compensaciones_formula_check CHECK (((formula)::text = ANY (ARRAY[('fijo'::character varying)::text, ('tabla'::character varying)::text, ('prorrateo'::character varying)::text, ('presupuesto'::character varying)::text, ('rango'::character varying)::text]))),
    CONSTRAINT config_compensaciones_unidad_medida_check CHECK (((unidad_medida)::text = ANY (ARRAY[('dia'::character varying)::text, ('hora'::character varying)::text, ('monto'::character varying)::text])))
);


--
-- Name: config_compensaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.config_compensaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: config_compensaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.config_compensaciones_id_seq OWNED BY public.config_compensaciones.id;


--
-- Name: contextos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contextos (
    id bigint NOT NULL,
    nombre character varying(60) NOT NULL,
    descripcion character varying(200)
);


--
-- Name: contextos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contextos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contextos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contextos_id_seq OWNED BY public.contextos.id;


--
-- Name: cuentas_bancarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuentas_bancarias (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    banco_id bigint NOT NULL,
    numero_cuenta character varying(50),
    estado character varying(20) NOT NULL,
    CONSTRAINT cuentas_bancarias_estado_check CHECK (((estado)::text = ANY (ARRAY[('activa'::character varying)::text, ('inactiva'::character varying)::text])))
);


--
-- Name: cuentas_bancarias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuentas_bancarias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuentas_bancarias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuentas_bancarias_id_seq OWNED BY public.cuentas_bancarias.id;


--
-- Name: dependientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dependientes (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    tipo character varying(30) NOT NULL,
    nombre character varying(100) NOT NULL,
    cedula character varying(20),
    fecha_nacimiento date,
    discapacitado boolean DEFAULT false NOT NULL,
    porcentaje_deduccion smallint,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT dependientes_porcentaje_deduccion_check CHECK ((porcentaje_deduccion = ANY (ARRAY[50, 100]))),
    CONSTRAINT dependientes_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('hijo'::character varying)::text, ('conyuge_sin_ingresos'::character varying)::text])))
);


--
-- Name: dependientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dependientes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dependientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dependientes_id_seq OWNED BY public.dependientes.id;


--
-- Name: descuentos_personal_periodo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.descuentos_personal_periodo (
    id bigint NOT NULL,
    periodo_id bigint NOT NULL,
    persona_id bigint NOT NULL,
    catalogo_item_id bigint NOT NULL,
    importe numeric(14,2) NOT NULL,
    estado character varying(20) DEFAULT 'borrador'::character varying NOT NULL,
    observaciones text,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    usuario_creacion_id bigint,
    monto_aplicado numeric(14,2) DEFAULT 0,
    monto_no_aplicado numeric(14,2) DEFAULT 0,
    enviada_acreedor_en timestamp with time zone,
    acreedor_id bigint,
    fecha_comunicacion timestamp with time zone,
    fecha_hasta date,
    CONSTRAINT descuentos_personal_periodo_estado_check CHECK (((estado)::text = ANY ((ARRAY['borrador'::character varying, 'confirmado'::character varying, 'aplicado'::character varying, 'parcial'::character varying, 'deficit'::character varying, 'no_revista'::character varying, 'anulado'::character varying])::text[]))),
    CONSTRAINT descuentos_personal_periodo_importe_check CHECK ((importe > (0)::numeric))
);


--
-- Name: COLUMN descuentos_personal_periodo.fecha_hasta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.descuentos_personal_periodo.fecha_hasta IS 'Vigencia del descuento (ej. CUOTA_ING). NULL = sin vencimiento. Se aplica si NULL o >= fecha del período.';


--
-- Name: descuentos_personal_periodo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.descuentos_personal_periodo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: descuentos_personal_periodo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.descuentos_personal_periodo_id_seq OWNED BY public.descuentos_personal_periodo.id;


--
-- Name: descuentos_personales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.descuentos_personales (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    acreedor_id bigint NOT NULL,
    liquidacion_id bigint,
    tipo character varying(20) NOT NULL,
    monto_solicitado numeric(14,2) NOT NULL,
    monto_aplicado numeric(14,2),
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    periodo_anio smallint NOT NULL,
    periodo_mes smallint NOT NULL,
    fecha_importacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    archivo_origen character varying(200),
    enviada_acreedor_en timestamp without time zone,
    observaciones text,
    CONSTRAINT descuentos_personales_estado_check CHECK (((estado)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('aplicado'::character varying)::text, ('parcial'::character varying)::text, ('rechazado'::character varying)::text, ('no_revista'::character varying)::text, ('deficit'::character varying)::text, ('anulado'::character varying)::text]))),
    CONSTRAINT descuentos_personales_monto_solicitado_check CHECK ((monto_solicitado > (0)::numeric)),
    CONSTRAINT descuentos_personales_periodo_mes_check CHECK (((periodo_mes >= 1) AND (periodo_mes <= 12))),
    CONSTRAINT descuentos_personales_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('eventual'::character varying)::text, ('permanente'::character varying)::text])))
);


--
-- Name: TABLE descuentos_personales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.descuentos_personales IS 'Descuentos eventuales y permanentes unificados (equiv. DTOPEREV.DBF + DTOPERPE.DBF)';


--
-- Name: descuentos_personales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.descuentos_personales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: descuentos_personales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.descuentos_personales_id_seq OWNED BY public.descuentos_personales.id;


--
-- Name: documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos (
    id bigint NOT NULL,
    tipo character varying(50) NOT NULL,
    entidad_id bigint NOT NULL,
    ruta_relativa character varying(500) NOT NULL,
    nombre_original character varying(255) NOT NULL,
    content_type character varying(100) NOT NULL,
    tamanio_bytes bigint NOT NULL,
    fecha_carga timestamp without time zone DEFAULT now() NOT NULL,
    usuario_carga_id bigint
);


--
-- Name: documentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documentos_id_seq OWNED BY public.documentos.id;


--
-- Name: escalafones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escalafones (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    denominacion character varying(100) NOT NULL,
    vigente boolean DEFAULT true NOT NULL
);


--
-- Name: escalafones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.escalafones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: escalafones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.escalafones_id_seq OWNED BY public.escalafones.id;


--
-- Name: form3100; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form3100 (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    cappu_categoria smallint,
    fondo_solidaridad character varying(10),
    adicional_fondo_solidaridad boolean DEFAULT false NOT NULL,
    aplica_minimo_no_imponible boolean DEFAULT false NOT NULL,
    conyuge_nombre character varying(100),
    conyuge_apellido character varying(100),
    conyuge_fecha_nacimiento date,
    conyuge_cedula character varying(20),
    conyuge_sexo character varying(1),
    conyuge_nacionalidad character varying(100),
    vigente_desde_mes smallint NOT NULL,
    vigente_desde_anio smallint NOT NULL,
    documento_id bigint,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    usuario_creacion_id bigint,
    cappu_importe NUMERIC(14,2) NOT NULL DEFAULT 0,
    reintegro_aporte NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT ck_form3100_cappu_importe_no_negativo CHECK (cappu_importe >= 0),
    CONSTRAINT ck_form3100_reintegro_aporte_no_negativo CHECK (reintegro_aporte >= 0),
    CONSTRAINT form3100_cappu_categoria_check CHECK (((cappu_categoria >= 1) AND (cappu_categoria <= 10))),
    CONSTRAINT form3100_conyuge_sexo_check CHECK (((conyuge_sexo)::text = ANY (ARRAY[('M'::character varying)::text, ('F'::character varying)::text]))),
    CONSTRAINT form3100_fondo_solidaridad_check CHECK (((fondo_solidaridad)::text = ANY (ARRAY[('0.5_BPC'::character varying)::text, ('1_BPC'::character varying)::text, ('2_BPC'::character varying)::text]))),
    CONSTRAINT form3100_vigente_desde_anio_check CHECK ((vigente_desde_anio > 2000)),
    CONSTRAINT form3100_vigente_desde_mes_check CHECK (((vigente_desde_mes >= 1) AND (vigente_desde_mes <= 12)))
);

COMMENT ON COLUMN public.form3100.cappu_importe IS
    'Importe mensual de la categoria Caja Profesional usada en la deduccion profesional IRPF.';

COMMENT ON COLUMN public.form3100.reintegro_aporte IS
    'Reintegro mensual de aporte profesional declarado en Form 3100.';


--
-- Name: form3100_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.form3100_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form3100_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.form3100_id_seq OWNED BY public.form3100.id;


--
-- Name: form3100_personas_cargo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form3100_personas_cargo (
    id bigint NOT NULL,
    form3100_id bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    fecha_nacimiento date NOT NULL,
    cedula character varying(20),
    sexo character varying(1) NOT NULL,
    porcentaje_atribucion smallint NOT NULL,
    relacion character varying(100) NOT NULL,
    discapacidad boolean DEFAULT false NOT NULL,
    CONSTRAINT form3100_personas_cargo_porcentaje_atribucion_check CHECK ((porcentaje_atribucion = ANY (ARRAY[0, 50, 100]))),
    CONSTRAINT form3100_personas_cargo_sexo_check CHECK (((sexo)::text = ANY (ARRAY[('M'::character varying)::text, ('F'::character varying)::text])))
);


--
-- Name: form3100_personas_cargo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.form3100_personas_cargo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form3100_personas_cargo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.form3100_personas_cargo_id_seq OWNED BY public.form3100_personas_cargo.id;


--
-- Name: franjas_irpf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.franjas_irpf (
    id bigint NOT NULL,
    numero_franja smallint NOT NULL,
    desde_bpc numeric(8,2) NOT NULL,
    hasta_bpc numeric(8,2),
    tasa numeric(5,4) NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    CONSTRAINT franjas_irpf_numero_franja_check CHECK (((numero_franja >= 1) AND (numero_franja <= 8))),
    CONSTRAINT franjas_irpf_tasa_check CHECK (((tasa >= (0)::numeric) AND (tasa <= (1)::numeric)))
);


--
-- Name: TABLE franjas_irpf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.franjas_irpf IS 'Franjas progresivas IRPF en BPC mensuales (hasta 8 franjas según DGI)';


--
-- Name: franjas_irpf_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.franjas_irpf_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: franjas_irpf_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.franjas_irpf_id_seq OWNED BY public.franjas_irpf.id;


--
-- Name: grados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grados (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    escalafon_id bigint,
    denominacion character varying(100) NOT NULL,
    orden smallint NOT NULL,
    vigente boolean DEFAULT true NOT NULL,
    es_oficial boolean DEFAULT false NOT NULL,
    es_subalterno boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN grados.es_oficial; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grados.es_oficial IS 'True para grados de oficiales (determina Sit10Calculator)';


--
-- Name: COLUMN grados.es_subalterno; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grados.es_subalterno IS 'True para grados subalternos (determina ascensos automáticos)';


--
-- Name: grados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grados_id_seq OWNED BY public.grados.id;


--
-- Name: historico_liquidaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico_liquidaciones (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    anio smallint NOT NULL,
    mes smallint NOT NULL,
    haberes_gravados numeric(14,2) NOT NULL,
    situacion_id bigint,
    grado_id bigint,
    escalafon_id bigint,
    unidad_id bigint,
    programa_id bigint,
    regimen_id bigint,
    origen character varying(20) DEFAULT 'SISTEMA'::character varying NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_historico_anio CHECK ((anio > 2000)),
    CONSTRAINT ck_historico_haberes CHECK ((haberes_gravados >= (0)::numeric)),
    CONSTRAINT ck_historico_mes CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: historico_liquidaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.historico_liquidaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historico_liquidaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.historico_liquidaciones_id_seq OWNED BY public.historico_liquidaciones.id;


--
-- Name: incidencias_calculo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidencias_calculo (
    id bigint NOT NULL,
    periodo_id bigint NOT NULL,
    version integer NOT NULL,
    persona_id bigint NOT NULL,
    tipo character varying(50) NOT NULL,
    descripcion text NOT NULL,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_incidencias_calculo_tipo CHECK (((tipo)::text = ANY (ARRAY[('BeneficioYaPagado'::character varying)::text, ('BeneficioRetroactivoPendiente'::character varying)::text, ('TipoBeneficioDesconocido'::character varying)::text, ('SubtipoPsfDesconocido'::character varying)::text, ('ErrorCalculo'::character varying)::text, ('InstructivoNoConfigurado'::character varying)::text, ('CalculoSimplificado'::character varying)::text, ('CatalogoItemNoConfigurado'::character varying)::text])))
);


--
-- Name: TABLE incidencias_calculo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.incidencias_calculo IS 'Incidencias detectadas por el motor de cálculo de haberes durante la generación de liquidaciones';


--
-- Name: incidencias_calculo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incidencias_calculo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incidencias_calculo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incidencias_calculo_id_seq OWNED BY public.incidencias_calculo.id;


--
-- Name: instructivo_asig_familiar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructivo_asig_familiar (
    id bigint NOT NULL,
    tipo_franja character varying(20) NOT NULL,
    importe numeric(14,2) NOT NULL,
    vigente_desde date NOT NULL,
    descripcion_porcentaje character varying(10),
    CONSTRAINT ck_instructivo_asig_familiar_importe CHECK ((importe > (0)::numeric)),
    CONSTRAINT ck_instructivo_asig_familiar_tipo CHECK (((tipo_franja)::text = ANY (ARRAY[('franja_8'::character varying)::text, ('franja_16'::character varying)::text, ('discapacidad'::character varying)::text])))
);


--
-- Name: TABLE instructivo_asig_familiar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.instructivo_asig_familiar IS 'Montos del instructivo DFC para Asignación Familiar: franja 8%, 16% y discapacidad (32%)';


--
-- Name: instructivo_asig_familiar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instructivo_asig_familiar_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instructivo_asig_familiar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instructivo_asig_familiar_id_seq OWNED BY public.instructivo_asig_familiar.id;


--
-- Name: instructivo_psf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructivo_psf (
    id bigint NOT NULL,
    numero_categoria smallint NOT NULL,
    descripcion character varying(80) NOT NULL,
    importe numeric(14,2) NOT NULL,
    vigente_desde date NOT NULL,
    CONSTRAINT ck_instructivo_psf_categoria CHECK (((numero_categoria >= 1) AND (numero_categoria <= 5))),
    CONSTRAINT ck_instructivo_psf_importe CHECK ((importe > (0)::numeric))
);


--
-- Name: TABLE instructivo_psf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.instructivo_psf IS 'Montos del instructivo DFC para Prima Solidaria Familiar por categoría (Ley 17.930 Art. 80)';


--
-- Name: instructivo_psf_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.instructivo_psf_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: instructivo_psf_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.instructivo_psf_id_seq OWNED BY public.instructivo_psf.id;


--
-- Name: irpf_detalle_franjas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.irpf_detalle_franjas (
    id bigint NOT NULL,
    irpf_mensual_id bigint NOT NULL,
    franja_irpf_id bigint NOT NULL,
    base_en_franja numeric(14,2) NOT NULL,
    tasa numeric(5,4) NOT NULL,
    impuesto numeric(14,2) NOT NULL
);


--
-- Name: TABLE irpf_detalle_franjas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.irpf_detalle_franjas IS 'Detalle de impuesto calculado por cada franja IRPF';


--
-- Name: irpf_detalle_franjas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.irpf_detalle_franjas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: irpf_detalle_franjas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.irpf_detalle_franjas_id_seq OWNED BY public.irpf_detalle_franjas.id;


--
-- Name: irpf_mensual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.irpf_mensual (
    id bigint NOT NULL,
    liquidacion_id bigint NOT NULL,
    persona_id bigint NOT NULL,
    ingresos_gravados numeric(14,2) NOT NULL,
    deduccion_aportes numeric(14,2) DEFAULT 0 NOT NULL,
    deduccion_hijos numeric(14,2) DEFAULT 0 NOT NULL,
    deduccion_conyuge numeric(14,2) DEFAULT 0 NOT NULL,
    deduccion_profesional numeric(14,2) DEFAULT 0 NOT NULL,
    tasa_deduccion_profesional numeric(5,4) NOT NULL,
    total_deducciones numeric(14,2) NOT NULL,
    base_imponible_neta numeric(14,2) NOT NULL,
    total_irpf numeric(14,2) NOT NULL
);


--
-- Name: TABLE irpf_mensual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.irpf_mensual IS 'Resultado IRPF mensual por persona (datos para Formulario 470 DGI)';


--
-- Name: irpf_mensual_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.irpf_mensual_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: irpf_mensual_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.irpf_mensual_id_seq OWNED BY public.irpf_mensual.id;


--
-- Name: items_aguinaldo_baja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items_aguinaldo_baja (
    id bigint NOT NULL,
    aguinaldo_baja_id bigint NOT NULL,
    codigo_concepto character varying(20) NOT NULL,
    nombre_concepto character varying(150) NOT NULL,
    importe numeric(14,2) NOT NULL,
    tipo character varying(20) NOT NULL
);


--
-- Name: items_aguinaldo_baja_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.items_aguinaldo_baja_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_aguinaldo_baja_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.items_aguinaldo_baja_id_seq OWNED BY public.items_aguinaldo_baja.id;


--
-- Name: items_liquidacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items_liquidacion (
    id bigint NOT NULL,
    liquidacion_id bigint NOT NULL,
    persona_id bigint NOT NULL,
    relacion_laboral_id bigint NOT NULL,
    catalogo_item_id bigint NOT NULL,
    codigo_item integer NOT NULL,
    monto numeric(14,2) DEFAULT 0 NOT NULL,
    base_calculo numeric(14,2),
    tasa_aplicada numeric(8,6),
    regla_aplicada character varying(100),
    es_retroactividad boolean DEFAULT false NOT NULL,
    estado character varying(20) DEFAULT 'calculado'::character varying NOT NULL,
    CONSTRAINT items_liquidacion_estado_check CHECK (((estado)::text = ANY (ARRAY[('calculado'::character varying)::text, ('revisar'::character varying)::text, ('error'::character varying)::text, ('ajustado'::character varying)::text, ('no_cobro'::character varying)::text])))
);


--
-- Name: TABLE items_liquidacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.items_liquidacion IS 'Ítems calculados por funcionario por período (~60K filas/mes)';


--
-- Name: items_liquidacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.items_liquidacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_liquidacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.items_liquidacion_id_seq OWNED BY public.items_liquidacion.id;


--
-- Name: items_lote_compensacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items_lote_compensacion (
    id bigint NOT NULL,
    lote_compensacion_id bigint NOT NULL,
    persona_id bigint NOT NULL,
    unidad_cantidad numeric(10,2) NOT NULL,
    monto numeric(14,2),
    estado character varying(20) NOT NULL,
    incidencia character varying(200),
    observaciones text,
    funcion character varying(50),
    sujeto_desc_legales boolean DEFAULT false NOT NULL,
    snapshot_grado_id bigint,
    snapshot_situacion_id bigint,
    snapshot_unidad_id bigint,
    ala character varying(1),
    categoria_compensacion character varying(50),
    snapshot_programa_id bigint,
    CONSTRAINT items_lote_compensacion_ala_check CHECK (((ala IS NULL) OR ((ala)::text = ANY (ARRAY[('A'::character varying)::text, ('N'::character varying)::text, ('S'::character varying)::text])))),
    CONSTRAINT items_lote_compensacion_estado_check CHECK (((estado)::text = ANY (ARRAY[('ok'::character varying)::text, ('verificar'::character varying)::text, ('error'::character varying)::text])))
);


--
-- Name: items_lote_compensacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.items_lote_compensacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_lote_compensacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.items_lote_compensacion_id_seq OWNED BY public.items_lote_compensacion.id;


--
-- Name: liquidacion_estados_personal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidacion_estados_personal (
    id bigint NOT NULL,
    periodo_id bigint NOT NULL,
    cedula character varying(20) NOT NULL,
    version integer NOT NULL,
    estado character varying(20) NOT NULL,
    mensaje_error text,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: TABLE liquidacion_estados_personal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.liquidacion_estados_personal IS 'Estado de cálculo por funcionario y versión';


--
-- Name: liquidacion_estados_personal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.liquidacion_estados_personal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: liquidacion_estados_personal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.liquidacion_estados_personal_id_seq OWNED BY public.liquidacion_estados_personal.id;


--
-- Name: liquidacion_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidacion_items (
    id bigint NOT NULL,
    periodo_id bigint NOT NULL,
    cedula character varying(20) NOT NULL,
    version integer NOT NULL,
    codigo_concepto character varying(20) NOT NULL,
    nombre_concepto character varying(150) NOT NULL,
    importe numeric(14,2) NOT NULL,
    rubro_contable character varying(50) NOT NULL,
    objeto_gasto character varying(50),
    programa_id bigint,
    regimen_id bigint,
    rubro_083 boolean DEFAULT false NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    clave_evento character varying(80)
);


--
-- Name: TABLE liquidacion_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.liquidacion_items IS 'Ítems calculados por funcionario y versión para cada período de liquidación';


--
-- Name: liquidacion_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.liquidacion_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: liquidacion_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.liquidacion_items_id_seq OWNED BY public.liquidacion_items.id;


--
-- Name: liquidacion_resumenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidacion_resumenes (
    id bigint NOT NULL,
    periodo_id bigint NOT NULL,
    version integer NOT NULL,
    programa_id bigint,
    regimen_id bigint,
    rubro_083 boolean DEFAULT false NOT NULL,
    total_importe numeric(14,2) NOT NULL,
    descripcion character varying(100)
);


--
-- Name: TABLE liquidacion_resumenes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.liquidacion_resumenes IS 'Resúmenes agregados de cálculo por período, versión, programa y régimen';


--
-- Name: liquidacion_resumenes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.liquidacion_resumenes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: liquidacion_resumenes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.liquidacion_resumenes_id_seq OWNED BY public.liquidacion_resumenes.id;


--
-- Name: liquidaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidaciones (
    id bigint NOT NULL,
    anio smallint NOT NULL,
    mes smallint NOT NULL,
    version smallint DEFAULT 1 NOT NULL,
    estado character varying(20) DEFAULT 'abierta'::character varying NOT NULL,
    parametros_periodo_id bigint NOT NULL,
    abierta_por bigint NOT NULL,
    abierta_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    calculada_en timestamp without time zone,
    cerrada_por bigint,
    cerrada_en timestamp without time zone,
    observaciones text,
    CONSTRAINT liquidaciones_estado_check CHECK (((estado)::text = ANY (ARRAY[('abierta'::character varying)::text, ('en_calculo'::character varying)::text, ('calculada'::character varying)::text, ('en_revision'::character varying)::text, ('cerrada'::character varying)::text]))),
    CONSTRAINT liquidaciones_mes_check CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: TABLE liquidaciones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.liquidaciones IS 'Cabecera de liquidación mensual con workflow de estados';


--
-- Name: liquidaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.liquidaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: liquidaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.liquidaciones_id_seq OWNED BY public.liquidaciones.id;


--
-- Name: lotes_compensacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lotes_compensacion (
    id bigint NOT NULL,
    tipo_compensacion_id bigint NOT NULL,
    estado character varying(20) DEFAULT 'borrador'::character varying NOT NULL,
    fuente character varying(150),
    nombre_archivo character varying(200),
    hash_archivo character varying(100),
    usuario_id bigint NOT NULL,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    aprobado_por bigint,
    aprobado_en timestamp without time zone,
    periodo_id bigint NOT NULL,
    CONSTRAINT lotes_compensacion_estado_check CHECK (((estado)::text = ANY (ARRAY[('borrador'::character varying)::text, ('validado'::character varying)::text, ('aprobado'::character varying)::text, ('exportado'::character varying)::text, ('rechazado'::character varying)::text])))
);


--
-- Name: lotes_compensacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lotes_compensacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lotes_compensacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lotes_compensacion_id_seq OWNED BY public.lotes_compensacion.id;


--
-- Name: motivos_baja; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motivos_baja (
    id bigint NOT NULL,
    codigo character varying(50) NOT NULL,
    denominacion character varying(200) NOT NULL,
    vigente boolean DEFAULT true NOT NULL
);


--
-- Name: motivos_baja_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.motivos_baja_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: motivos_baja_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.motivos_baja_id_seq OWNED BY public.motivos_baja.id;


--
-- Name: movimientos_laborales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_laborales (
    id bigint NOT NULL,
    relacion_laboral_id bigint NOT NULL,
    tipo_movimiento_id bigint NOT NULL,
    fecha_movimiento date NOT NULL,
    retroactivo_desde date,
    usuario_id bigint,
    observaciones text,
    es_automatico boolean DEFAULT false NOT NULL,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    puesto character varying(100),
    plaza character varying(50)
);


--
-- Name: COLUMN movimientos_laborales.es_automatico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.movimientos_laborales.es_automatico IS 'True si fue generado por ascenso automático';


--
-- Name: movimientos_laborales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_laborales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_laborales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_laborales_id_seq OWNED BY public.movimientos_laborales.id;


--
-- Name: novedades_periodo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.novedades_periodo (
    id bigint NOT NULL,
    periodo_id bigint NOT NULL,
    persona_id bigint NOT NULL,
    tipo character varying(30) NOT NULL,
    dias_afectados smallint NOT NULL,
    porcentaje_subsidio numeric(5,2),
    fecha_desde date,
    fecha_hasta date,
    observaciones text,
    estado character varying(20) DEFAULT 'borrador'::character varying NOT NULL,
    creado_por bigint,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    confirmado_por bigint,
    confirmado_en timestamp without time zone,
    CONSTRAINT novedades_periodo_dias_afectados_check CHECK (((dias_afectados >= 1) AND (dias_afectados <= 30))),
    CONSTRAINT novedades_periodo_estado_check CHECK (((estado)::text = ANY (ARRAY[('borrador'::character varying)::text, ('confirmada'::character varying)::text, ('anulada'::character varying)::text]))),
    CONSTRAINT novedades_periodo_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('dias_eximidos'::character varying)::text, ('retiro_parcial'::character varying)::text, ('subsidio_enfermedad'::character varying)::text])))
);


--
-- Name: novedades_periodo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.novedades_periodo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: novedades_periodo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.novedades_periodo_id_seq OWNED BY public.novedades_periodo.id;


--
-- Name: parametros_periodo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_periodo (
    id bigint NOT NULL,
    anio smallint NOT NULL,
    mes smallint NOT NULL,
    bpc_anual numeric(14,2) NOT NULL,
    tasa_montepio_ley_vieja numeric(5,4) DEFAULT 0.1300 NOT NULL,
    tasa_montepio_ley_nueva numeric(5,4) DEFAULT 0.1500 NOT NULL,
    tasa_fonasa numeric(5,4) DEFAULT 0.0450 NOT NULL,
    tasa_frl numeric(5,4) DEFAULT 0.0010 NOT NULL,
    umbral_deduccion_bpc smallint DEFAULT 15 NOT NULL,
    tasa_deduccion_alta numeric(5,4) DEFAULT 0.0800 NOT NULL,
    tasa_deduccion_baja numeric(5,4) DEFAULT 0.1400 NOT NULL,
    porcentaje_minimo_deficit numeric(5,4) DEFAULT 0.3500 NOT NULL,
    tasa_aporte_civil numeric(5,4) DEFAULT 0.1950 NOT NULL,
    creado_por bigint,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tasa_tutela_social numeric(5,4) DEFAULT 0.01 NOT NULL,
    CONSTRAINT parametros_periodo_mes_check CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: TABLE parametros_periodo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.parametros_periodo IS 'Parámetros globales de cálculo por mes (BPC, tasas)';


--
-- Name: parametros_periodo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parametros_periodo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parametros_periodo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parametros_periodo_id_seq OWNED BY public.parametros_periodo.id;


--
-- Name: periodos_liquidacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.periodos_liquidacion (
    id bigint NOT NULL,
    anio smallint NOT NULL,
    mes smallint NOT NULL,
    estado character varying(20) DEFAULT 'ABIERTA'::character varying NOT NULL,
    snapshot_id bigint NOT NULL,
    fecha_apertura timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    usuario_apertura bigint NOT NULL,
    hash_snapshot character varying(64) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_cierre_insumos timestamp without time zone,
    usuario_cierre_insumos bigint,
    fecha_calculo timestamp without time zone,
    usuario_calculo bigint,
    fecha_cierre timestamp without time zone,
    usuario_cierre bigint,
    CONSTRAINT periodos_liquidacion_estado_check CHECK (((estado)::text = ANY (ARRAY[('ABIERTA'::character varying)::text, ('LISTA_CALCULO'::character varying)::text, ('EN_CALCULO'::character varying)::text, ('CALCULADA'::character varying)::text, ('CERRADA'::character varying)::text]))),
    CONSTRAINT periodos_liquidacion_mes_check CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: TABLE periodos_liquidacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.periodos_liquidacion IS 'Registro de períodos de liquidación abiertos con snapshot de insumos';


--
-- Name: periodos_liquidacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.periodos_liquidacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: periodos_liquidacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.periodos_liquidacion_id_seq OWNED BY public.periodos_liquidacion.id;


--
-- Name: personas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personas (
    id bigint NOT NULL,
    cedula character varying(12) NOT NULL,
    primer_nombre character varying(100) NOT NULL,
    segundo_nombre character varying(100),
    primer_apellido character varying(100) NOT NULL,
    segundo_apellido character varying(100),
    fecha_nacimiento date,
    email character varying(150),
    telefono character varying(30),
    direccion character varying(200),
    codigo_postal character varying(10),
    departamento character varying(100),
    localidad character varying(100),
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: personas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.personas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: personas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.personas_id_seq OWNED BY public.personas.id;


--
-- Name: programas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programas (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    denominacion character varying(100) NOT NULL,
    vigente boolean DEFAULT true NOT NULL
);


--
-- Name: programas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.programas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: programas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.programas_id_seq OWNED BY public.programas.id;


--
-- Name: regimenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regimenes (
    id bigint NOT NULL,
    numero_ley character varying(30) NOT NULL,
    denominacion character varying(100) NOT NULL,
    vigente boolean DEFAULT true NOT NULL,
    es_ley_vieja boolean DEFAULT false NOT NULL
);


--
-- Name: regimenes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regimenes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regimenes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regimenes_id_seq OWNED BY public.regimenes.id;


--
-- Name: reglas_ascenso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reglas_ascenso (
    id bigint NOT NULL,
    grado_origen_id bigint NOT NULL,
    grado_destino_id bigint NOT NULL,
    dias_minimos integer NOT NULL,
    requisitos_adicionales text,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT reglas_ascenso_dias_minimos_check CHECK ((dias_minimos > 0))
);


--
-- Name: TABLE reglas_ascenso; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reglas_ascenso IS 'Tiempo mínimo por grado para ascenso automático (365/730/1095 días)';


--
-- Name: reglas_ascenso_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reglas_ascenso_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reglas_ascenso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reglas_ascenso_id_seq OWNED BY public.reglas_ascenso.id;


--
-- Name: relaciones_laborales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relaciones_laborales (
    id bigint NOT NULL,
    persona_id bigint NOT NULL,
    regimen_id bigint NOT NULL,
    unidad_id bigint NOT NULL,
    programa_id bigint NOT NULL,
    situacion_id bigint NOT NULL,
    escalafon_id bigint NOT NULL,
    grado_id bigint NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date,
    estado character varying(20) NOT NULL,
    prima_tecnica character varying(10) DEFAULT 'VACIO'::character varying,
    prima_solidaria_familiar character varying(30),
    riesgo_vuelo numeric(14,2),
    anios_inactivos integer,
    observaciones text,
    sub_unidad_id bigint,
    motivo_baja_id bigint,
    fecha_ultimo_ascenso date,
    grado_reincorporacion_id bigint,
    haber_retiro numeric(14,2),
    porcentaje_progresivo numeric(5,4),
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    categoria_viatico smallint DEFAULT 0 NOT NULL,
    usa_fonasa boolean DEFAULT false NOT NULL,
    anios_servicio_anterior smallint DEFAULT 0 NOT NULL,
    fecha_ascenso_oficial date,
    superprima boolean DEFAULT false NOT NULL,
    CONSTRAINT relaciones_laborales_estado_check CHECK (((estado)::text = ANY (ARRAY[('activo'::character varying)::text, ('inactivo'::character varying)::text])))
);


--
-- Name: COLUMN relaciones_laborales.fecha_ascenso_oficial; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.relaciones_laborales.fecha_ascenso_oficial IS 'Fecha de ascenso a oficial; base del progresivo 044.001 para oficiales. NULL para tropa (usa fecha_inicio).';


--
-- Name: COLUMN relaciones_laborales.superprima; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.relaciones_laborales.superprima IS 'True si el funcionario cobra Prima Idoneidad (OG 042.093). Legacy SUM33306, LIQALID.DBF cod 221/222.';


--
-- Name: relaciones_laborales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.relaciones_laborales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: relaciones_laborales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.relaciones_laborales_id_seq OWNED BY public.relaciones_laborales.id;


--
-- Name: remuneraciones_grado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remuneraciones_grado (
    id bigint NOT NULL,
    grado_id bigint NOT NULL,
    item_id bigint NOT NULL,
    monto numeric(14,2) NOT NULL,
    tipo_monto character varying(20) DEFAULT 'mensual'::character varying NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    creado_por bigint,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT remuneraciones_grado_monto_check CHECK ((monto >= (0)::numeric))
);


--
-- Name: TABLE remuneraciones_grado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.remuneraciones_grado IS 'Sueldo base y compensaciones por grado militar (equiv. REMUMIL.DBF)';


--
-- Name: COLUMN remuneraciones_grado.tipo_monto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.remuneraciones_grado.tipo_monto IS 'mensual | diario | hora | por_unidad';


--
-- Name: remuneraciones_grado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.remuneraciones_grado_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: remuneraciones_grado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.remuneraciones_grado_id_seq OWNED BY public.remuneraciones_grado.id;


--
-- Name: retroactividad_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retroactividad_items (
    id bigint NOT NULL,
    retroactividad_id bigint NOT NULL,
    codigo_item integer NOT NULL,
    monto_anterior numeric(14,2) NOT NULL,
    monto_nuevo numeric(14,2) NOT NULL,
    diferencia numeric(14,2) NOT NULL,
    monto_total_retro numeric(14,2) NOT NULL,
    es_descuento boolean DEFAULT false NOT NULL
);


--
-- Name: retroactividad_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retroactividad_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retroactividad_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retroactividad_items_id_seq OWNED BY public.retroactividad_items.id;


--
-- Name: retroactividades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retroactividades (
    id bigint NOT NULL,
    periodo_id bigint NOT NULL,
    persona_id bigint NOT NULL,
    periodo_referencia_id bigint NOT NULL,
    tipo character varying(30) NOT NULL,
    meses_retro smallint NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    creado_por bigint,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    confirmado_por bigint,
    confirmado_en timestamp without time zone,
    calculado_en timestamp without time zone,
    CONSTRAINT retroactividades_estado_check CHECK (((estado)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('confirmada'::character varying)::text, ('calculada'::character varying)::text, ('aplicada'::character varying)::text, ('anulada'::character varying)::text]))),
    CONSTRAINT retroactividades_meses_retro_check CHECK ((meses_retro > 0)),
    CONSTRAINT retroactividades_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('haberes'::character varying)::text, ('beneficios'::character varying)::text, ('prima_tecnica'::character varying)::text, ('super_prima'::character varying)::text])))
);


--
-- Name: retroactividades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retroactividades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retroactividades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retroactividades_id_seq OWNED BY public.retroactividades.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id bigint NOT NULL,
    nombre character varying(60) NOT NULL,
    descripcion character varying(200)
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    version character varying(50) NOT NULL,
    nombre character varying(200) NOT NULL,
    ejecutado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    checksum character varying(64),
    usuario character varying(100),
    tiempo_ejecucion_ms integer,
    estado character varying(20) DEFAULT 'SUCCESS'::character varying NOT NULL,
    error_mensaje text,
    CONSTRAINT schema_migrations_estado_check CHECK (((estado)::text = ANY (ARRAY[('SUCCESS'::character varying)::text, ('FAILED'::character varying)::text, ('RUNNING'::character varying)::text])))
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: situaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.situaciones (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    denominacion character varying(100) NOT NULL,
    descripcion character varying(300),
    vigente boolean DEFAULT true NOT NULL,
    calculador character varying(50),
    afecta_cobro boolean DEFAULT true NOT NULL,
    sistema_salud character varying(10) DEFAULT 'ssffaa'::character varying NOT NULL,
    CONSTRAINT situaciones_sistema_salud_check CHECK (((sistema_salud)::text = ANY (ARRAY[('ssffaa'::character varying)::text, ('fonasa'::character varying)::text])))
);


--
-- Name: COLUMN situaciones.calculador; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.situaciones.calculador IS 'Clase calculadora: Sit10Calculator, Sit30Calculator, etc.';


--
-- Name: COLUMN situaciones.afecta_cobro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.situaciones.afecta_cobro IS 'Si false, líquido=0 (ej: No Disponible, Licencia Sin Goce)';


--
-- Name: COLUMN situaciones.sistema_salud; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.situaciones.sistema_salud IS 'Sistema de salud: ssffaa (Sanidad Militar) o fonasa (FONASA para civiles)';


--
-- Name: situaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.situaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: situaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.situaciones_id_seq OWNED BY public.situaciones.id;


--
-- Name: snapshots_insumos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.snapshots_insumos (
    id bigint NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    contenido_json jsonb NOT NULL,
    hash_integridad character varying(64) NOT NULL
);


--
-- Name: TABLE snapshots_insumos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.snapshots_insumos IS 'Snapshot inmutable de insumos del período de liquidación';


--
-- Name: snapshots_insumos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.snapshots_insumos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: snapshots_insumos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.snapshots_insumos_id_seq OWNED BY public.snapshots_insumos.id;


--
-- Name: sub_unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_unidades (
    id bigint NOT NULL,
    unidad_id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    denominacion character varying(150) NOT NULL,
    vigente boolean DEFAULT true NOT NULL
);


--
-- Name: sub_unidades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sub_unidades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sub_unidades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sub_unidades_id_seq OWNED BY public.sub_unidades.id;


--
-- Name: tabla_hogar_constituido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tabla_hogar_constituido (
    id bigint NOT NULL,
    hasta_haberes numeric(14,2),
    importe numeric(14,2) NOT NULL,
    ref_porcentaje character varying(10),
    vigente_desde date NOT NULL,
    CONSTRAINT ck_tabla_hogar_importe CHECK ((importe > (0)::numeric))
);


--
-- Name: TABLE tabla_hogar_constituido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tabla_hogar_constituido IS 'Tabla de tramos de ingreso acumulado para Hogar Constituido (equivale a Hogarcon.dbf del legacy)';


--
-- Name: tabla_hogar_constituido_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tabla_hogar_constituido_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tabla_hogar_constituido_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tabla_hogar_constituido_id_seq OWNED BY public.tabla_hogar_constituido.id;


--
-- Name: tabla_permanencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tabla_permanencia (
    id bigint NOT NULL,
    escalafon_id bigint NOT NULL,
    grado_id bigint NOT NULL,
    meses_desde smallint DEFAULT 0 NOT NULL,
    meses_hasta smallint NOT NULL,
    monto_fijo numeric(14,2),
    porcentaje numeric(5,4),
    aplica_riesgo_vuelo boolean DEFAULT false NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_tabla_permanencia_meses CHECK ((meses_hasta >= meses_desde)),
    CONSTRAINT ck_tabla_permanencia_valor CHECK (((porcentaje IS NOT NULL) OR (monto_fijo IS NOT NULL)))
);


--
-- Name: tabla_permanencia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tabla_permanencia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tabla_permanencia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tabla_permanencia_id_seq OWNED BY public.tabla_permanencia.id;


--
-- Name: tarifas_por_categoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarifas_por_categoria (
    id bigint NOT NULL,
    item_id bigint NOT NULL,
    categoria character varying(50) NOT NULL,
    monto numeric(14,4) NOT NULL,
    tipo_monto character varying(20) DEFAULT 'mensual'::character varying NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    CONSTRAINT tarifas_por_categoria_monto_positivo CHECK ((monto > (0)::numeric)),
    CONSTRAINT tarifas_por_categoria_tipo_monto_check CHECK (((tipo_monto)::text = ANY (ARRAY[('mensual'::character varying)::text, ('diario'::character varying)::text, ('hora'::character varying)::text, ('por_unidad'::character varying)::text])))
);


--
-- Name: TABLE tarifas_por_categoria; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tarifas_por_categoria IS 'Tarifas del Instructivo MDN por categoría: VUELO (A/N/S) y SAR (función)';


--
-- Name: tarifas_por_categoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tarifas_por_categoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tarifas_por_categoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tarifas_por_categoria_id_seq OWNED BY public.tarifas_por_categoria.id;


--
-- Name: tipos_beneficio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_beneficio (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    nombre character varying(150) NOT NULL,
    es_mensual boolean DEFAULT true NOT NULL,
    permite_retroactividad boolean DEFAULT false NOT NULL,
    plazo_presentacion_dias smallint,
    monto_referencia numeric(14,2),
    catalogo_item_id bigint,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_tipos_beneficio_codigo_no_vacio CHECK ((btrim((codigo)::text) <> ''::text)),
    CONSTRAINT ck_tipos_beneficio_monto_no_negativo CHECK (((monto_referencia IS NULL) OR (monto_referencia >= (0)::numeric))),
    CONSTRAINT ck_tipos_beneficio_nombre_no_vacio CHECK ((btrim((nombre)::text) <> ''::text)),
    CONSTRAINT ck_tipos_beneficio_plazo_no_negativo CHECK (((plazo_presentacion_dias IS NULL) OR (plazo_presentacion_dias >= 0)))
);


--
-- Name: TABLE tipos_beneficio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tipos_beneficio IS 'Catálogo de tipos de beneficio social con reglas de vigencia y retroactividad';


--
-- Name: tipos_beneficio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_beneficio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_beneficio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_beneficio_id_seq OWNED BY public.tipos_beneficio.id;


--
-- Name: tipos_compensacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_compensacion (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    nombre character varying(120) NOT NULL,
    unidad_medida character varying(10) NOT NULL,
    requiere_fuente boolean DEFAULT true NOT NULL,
    vigente boolean DEFAULT true NOT NULL,
    CONSTRAINT tipos_compensacion_unidad_medida_check CHECK (((unidad_medida)::text = ANY (ARRAY[('dia'::character varying)::text, ('hora'::character varying)::text, ('monto'::character varying)::text])))
);


--
-- Name: tipos_compensacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_compensacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_compensacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_compensacion_id_seq OWNED BY public.tipos_compensacion.id;


--
-- Name: tipos_movimiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_movimiento (
    id bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    es_alta boolean NOT NULL
);


--
-- Name: tipos_movimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_movimiento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_movimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_movimiento_id_seq OWNED BY public.tipos_movimiento.id;


--
-- Name: tramos_sanidad_militar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tramos_sanidad_militar (
    id bigint NOT NULL,
    desde numeric(14,2) NOT NULL,
    hasta numeric(14,2),
    porcentaje numeric(5,4) NOT NULL,
    codigo_retencion integer NOT NULL,
    vigente_desde date NOT NULL,
    vigente_hasta date,
    CONSTRAINT tramos_sanidad_militar_porcentaje_check CHECK (((porcentaje >= (0)::numeric) AND (porcentaje <= (1)::numeric)))
);


--
-- Name: TABLE tramos_sanidad_militar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tramos_sanidad_militar IS 'Tramos de aporte a Sanidad Militar (Art. 94 Ley 18.834) sobre base sujeta a montepío';


--
-- Name: tramos_sanidad_militar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tramos_sanidad_militar_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tramos_sanidad_militar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tramos_sanidad_militar_id_seq OWNED BY public.tramos_sanidad_militar.id;


--
-- Name: unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidades (
    id bigint NOT NULL,
    codigo character varying(30) NOT NULL,
    denominacion character varying(150) NOT NULL,
    vigente boolean DEFAULT true NOT NULL
);


--
-- Name: unidades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.unidades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: unidades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.unidades_id_seq OWNED BY public.unidades.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id bigint NOT NULL,
    username character varying(60) NOT NULL,
    password_hash character varying(255) NOT NULL,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    intentos_fallidos smallint DEFAULT 0 NOT NULL,
    bloqueado_hasta timestamp without time zone,
    persona_id bigint,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT usuarios_estado_check CHECK (((estado)::text = ANY (ARRAY[('activo'::character varying)::text, ('bloqueado'::character varying)::text])))
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: usuarios_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios_roles (
    usuario_id bigint NOT NULL,
    rol_id bigint NOT NULL
);


--
-- Name: v_deficit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_deficit AS
 SELECT persona_id,
    periodo_anio,
    periodo_mes,
    sum(monto_solicitado) AS total_solicitado,
    sum(COALESCE(monto_aplicado, (0)::numeric)) AS total_aplicado,
    (sum(monto_solicitado) - sum(COALESCE(monto_aplicado, (0)::numeric))) AS total_no_aplicado,
    count(*) AS cantidad_descuentos
   FROM public.descuentos_personales dp
  WHERE ((estado)::text = ANY (ARRAY[('deficit'::character varying)::text, ('parcial'::character varying)::text]))
  GROUP BY persona_id, periodo_anio, periodo_mes;


--
-- Name: VIEW v_deficit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_deficit IS 'Funcionarios con descuentos no aplicados por protección de déficit (Ley 19.210 Art 34)';


--
-- Name: v_liquidacion_totales; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_liquidacion_totales AS
 SELECT il.liquidacion_id,
    sum(
        CASE
            WHEN ((ci.tipo)::text = ANY (ARRAY[('haber_normal'::character varying)::text, ('haber_anual'::character varying)::text, ('haber_no_gravado'::character varying)::text, ('ficto_haber'::character varying)::text])) THEN il.monto
            ELSE (0)::numeric
        END) AS total_haberes,
    sum(
        CASE
            WHEN ((ci.tipo)::text = ANY (ARRAY[('beneficio_social_grav'::character varying)::text, ('beneficio_social_no_grav'::character varying)::text])) THEN il.monto
            ELSE (0)::numeric
        END) AS total_beneficios,
    sum(
        CASE
            WHEN ((ci.tipo)::text = 'descuento_legal'::text) THEN il.monto
            ELSE (0)::numeric
        END) AS total_descuentos_legales,
    sum(
        CASE
            WHEN ((ci.tipo)::text = 'descuento_personal'::text) THEN il.monto
            ELSE (0)::numeric
        END) AS total_descuentos_personales,
    sum(
        CASE
            WHEN ((ci.tipo)::text = 'ficto_descuento'::text) THEN il.monto
            ELSE (0)::numeric
        END) AS total_fictos_descuento,
    count(DISTINCT il.persona_id) AS cantidad_funcionarios
   FROM (public.items_liquidacion il
     JOIN public.catalogo_items ci ON ((ci.id = il.catalogo_item_id)))
  GROUP BY il.liquidacion_id;


--
-- Name: VIEW v_liquidacion_totales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_liquidacion_totales IS 'Totales por tipo de ítem y cantidad de funcionarios por liquidación';


--
-- Name: v_planilla_ajuste; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_planilla_ajuste AS
 SELECT dp.id AS descuento_periodo_id,
    dp.periodo_id,
    dp.persona_id,
    dp.acreedor_id,
    a.codigo AS acreedor_codigo,
    a.nombre AS acreedor_nombre,
    a.categoria_deficit,
    a.orden_legal_deficit,
    p.cedula,
    dp.catalogo_item_id,
    (ci.codigo)::text AS codigo_concepto,
    ci.nombre AS nombre_concepto,
    dp.importe AS monto_solicitado,
    COALESCE(sum(abs(li.importe)), (0)::numeric) AS monto_aplicado_calculado,
    (dp.importe - COALESCE(sum(abs(li.importe)), (0)::numeric)) AS monto_no_aplicado_calculado,
    dp.monto_aplicado AS monto_aplicado_manual,
    dp.monto_no_aplicado AS monto_no_aplicado_manual,
    dp.estado,
    dp.observaciones,
    dp.fecha_comunicacion,
    dp.fecha_creacion,
    dp.usuario_creacion_id,
    dp.enviada_acreedor_en
   FROM ((((public.descuentos_personal_periodo dp
     LEFT JOIN public.acreedores a ON ((a.id = dp.acreedor_id)))
     JOIN public.catalogo_items ci ON ((ci.id = dp.catalogo_item_id)))
     JOIN public.personas p ON ((p.id = dp.persona_id)))
     LEFT JOIN public.liquidacion_items li ON (((li.periodo_id = dp.periodo_id) AND ((li.cedula)::text = (p.cedula)::text) AND ((li.codigo_concepto)::text = (ci.codigo)::text))))
  GROUP BY dp.id, dp.periodo_id, dp.persona_id, dp.acreedor_id, a.codigo, a.nombre, a.categoria_deficit, a.orden_legal_deficit, p.cedula, dp.catalogo_item_id, ci.codigo, ci.nombre, dp.importe, dp.monto_aplicado, dp.monto_no_aplicado, dp.estado, dp.observaciones, dp.fecha_comunicacion, dp.fecha_creacion, dp.usuario_creacion_id, dp.enviada_acreedor_en;


--
-- Name: v_resumen_liquidacion; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_resumen_liquidacion AS
 SELECT il.liquidacion_id,
    rl.programa_id,
    ci.clasificacion_siif,
    sum(il.monto) AS total,
    count(DISTINCT il.persona_id) AS cantidad_funcionarios
   FROM ((public.items_liquidacion il
     JOIN public.catalogo_items ci ON ((ci.id = il.catalogo_item_id)))
     JOIN public.relaciones_laborales rl ON ((rl.id = il.relacion_laboral_id)))
  WHERE (ci.clasificacion_siif IS NOT NULL)
  GROUP BY il.liquidacion_id, rl.programa_id, ci.clasificacion_siif;


--
-- Name: VIEW v_resumen_liquidacion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_resumen_liquidacion IS 'Resumen por programa y clasificación SIIF para informe presupuestal';


--
-- Name: acciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acciones ALTER COLUMN id SET DEFAULT nextval('public.acciones_id_seq'::regclass);


--
-- Name: acreedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acreedores ALTER COLUMN id SET DEFAULT nextval('public.acreedores_id_seq'::regclass);


--
-- Name: aguinaldo_baja id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aguinaldo_baja ALTER COLUMN id SET DEFAULT nextval('public.aguinaldo_baja_id_seq'::regclass);


--
-- Name: aguinaldos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aguinaldos ALTER COLUMN id SET DEFAULT nextval('public.aguinaldos_id_seq'::regclass);


--
-- Name: bancos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bancos ALTER COLUMN id SET DEFAULT nextval('public.bancos_id_seq'::regclass);


--
-- Name: beneficio_social_beneficiarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficio_social_beneficiarios ALTER COLUMN id SET DEFAULT nextval('public.beneficio_social_beneficiarios_id_seq'::regclass);


--
-- Name: beneficios_sociales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficios_sociales ALTER COLUMN id SET DEFAULT nextval('public.beneficios_sociales_id_seq'::regclass);


--
-- Name: bitacora_auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_auditoria ALTER COLUMN id SET DEFAULT nextval('public.bitacora_auditoria_id_seq'::regclass);


--
-- Name: catalogo_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_items ALTER COLUMN id SET DEFAULT nextval('public.catalogo_items_id_seq'::regclass);


--
-- Name: cierres id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres ALTER COLUMN id SET DEFAULT nextval('public.cierres_id_seq'::regclass);


--
-- Name: compensaciones_diferencia_ascenso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compensaciones_diferencia_ascenso ALTER COLUMN id SET DEFAULT nextval('public.compensaciones_diferencia_ascenso_id_seq'::regclass);


--
-- Name: config_compensaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_compensaciones ALTER COLUMN id SET DEFAULT nextval('public.config_compensaciones_id_seq'::regclass);


--
-- Name: contextos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contextos ALTER COLUMN id SET DEFAULT nextval('public.contextos_id_seq'::regclass);


--
-- Name: cuentas_bancarias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_bancarias ALTER COLUMN id SET DEFAULT nextval('public.cuentas_bancarias_id_seq'::regclass);


--
-- Name: dependientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dependientes ALTER COLUMN id SET DEFAULT nextval('public.dependientes_id_seq'::regclass);


--
-- Name: descuentos_personal_periodo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personal_periodo ALTER COLUMN id SET DEFAULT nextval('public.descuentos_personal_periodo_id_seq'::regclass);


--
-- Name: descuentos_personales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personales ALTER COLUMN id SET DEFAULT nextval('public.descuentos_personales_id_seq'::regclass);


--
-- Name: documentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos ALTER COLUMN id SET DEFAULT nextval('public.documentos_id_seq'::regclass);


--
-- Name: escalafones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalafones ALTER COLUMN id SET DEFAULT nextval('public.escalafones_id_seq'::regclass);


--
-- Name: form3100 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100 ALTER COLUMN id SET DEFAULT nextval('public.form3100_id_seq'::regclass);


--
-- Name: form3100_personas_cargo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100_personas_cargo ALTER COLUMN id SET DEFAULT nextval('public.form3100_personas_cargo_id_seq'::regclass);


--
-- Name: franjas_irpf id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franjas_irpf ALTER COLUMN id SET DEFAULT nextval('public.franjas_irpf_id_seq'::regclass);


--
-- Name: grados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grados ALTER COLUMN id SET DEFAULT nextval('public.grados_id_seq'::regclass);


--
-- Name: historico_liquidaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones ALTER COLUMN id SET DEFAULT nextval('public.historico_liquidaciones_id_seq'::regclass);


--
-- Name: incidencias_calculo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias_calculo ALTER COLUMN id SET DEFAULT nextval('public.incidencias_calculo_id_seq'::regclass);


--
-- Name: instructivo_asig_familiar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructivo_asig_familiar ALTER COLUMN id SET DEFAULT nextval('public.instructivo_asig_familiar_id_seq'::regclass);


--
-- Name: instructivo_psf id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructivo_psf ALTER COLUMN id SET DEFAULT nextval('public.instructivo_psf_id_seq'::regclass);


--
-- Name: irpf_detalle_franjas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_detalle_franjas ALTER COLUMN id SET DEFAULT nextval('public.irpf_detalle_franjas_id_seq'::regclass);


--
-- Name: irpf_mensual id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_mensual ALTER COLUMN id SET DEFAULT nextval('public.irpf_mensual_id_seq'::regclass);


--
-- Name: items_aguinaldo_baja id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_aguinaldo_baja ALTER COLUMN id SET DEFAULT nextval('public.items_aguinaldo_baja_id_seq'::regclass);


--
-- Name: items_liquidacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_liquidacion ALTER COLUMN id SET DEFAULT nextval('public.items_liquidacion_id_seq'::regclass);


--
-- Name: items_lote_compensacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_lote_compensacion ALTER COLUMN id SET DEFAULT nextval('public.items_lote_compensacion_id_seq'::regclass);


--
-- Name: liquidacion_estados_personal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_estados_personal ALTER COLUMN id SET DEFAULT nextval('public.liquidacion_estados_personal_id_seq'::regclass);


--
-- Name: liquidacion_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_items ALTER COLUMN id SET DEFAULT nextval('public.liquidacion_items_id_seq'::regclass);


--
-- Name: liquidacion_resumenes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_resumenes ALTER COLUMN id SET DEFAULT nextval('public.liquidacion_resumenes_id_seq'::regclass);


--
-- Name: liquidaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones ALTER COLUMN id SET DEFAULT nextval('public.liquidaciones_id_seq'::regclass);


--
-- Name: lotes_compensacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_compensacion ALTER COLUMN id SET DEFAULT nextval('public.lotes_compensacion_id_seq'::regclass);


--
-- Name: motivos_baja id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motivos_baja ALTER COLUMN id SET DEFAULT nextval('public.motivos_baja_id_seq'::regclass);


--
-- Name: movimientos_laborales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_laborales ALTER COLUMN id SET DEFAULT nextval('public.movimientos_laborales_id_seq'::regclass);


--
-- Name: novedades_periodo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_periodo ALTER COLUMN id SET DEFAULT nextval('public.novedades_periodo_id_seq'::regclass);


--
-- Name: parametros_periodo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_periodo ALTER COLUMN id SET DEFAULT nextval('public.parametros_periodo_id_seq'::regclass);


--
-- Name: periodos_liquidacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_liquidacion ALTER COLUMN id SET DEFAULT nextval('public.periodos_liquidacion_id_seq'::regclass);


--
-- Name: personas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personas ALTER COLUMN id SET DEFAULT nextval('public.personas_id_seq'::regclass);


--
-- Name: programas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas ALTER COLUMN id SET DEFAULT nextval('public.programas_id_seq'::regclass);


--
-- Name: regimenes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regimenes ALTER COLUMN id SET DEFAULT nextval('public.regimenes_id_seq'::regclass);


--
-- Name: reglas_ascenso id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_ascenso ALTER COLUMN id SET DEFAULT nextval('public.reglas_ascenso_id_seq'::regclass);


--
-- Name: relaciones_laborales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales ALTER COLUMN id SET DEFAULT nextval('public.relaciones_laborales_id_seq'::regclass);


--
-- Name: remuneraciones_grado id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remuneraciones_grado ALTER COLUMN id SET DEFAULT nextval('public.remuneraciones_grado_id_seq'::regclass);


--
-- Name: retroactividad_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividad_items ALTER COLUMN id SET DEFAULT nextval('public.retroactividad_items_id_seq'::regclass);


--
-- Name: retroactividades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividades ALTER COLUMN id SET DEFAULT nextval('public.retroactividades_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);


--
-- Name: situaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.situaciones ALTER COLUMN id SET DEFAULT nextval('public.situaciones_id_seq'::regclass);


--
-- Name: snapshots_insumos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshots_insumos ALTER COLUMN id SET DEFAULT nextval('public.snapshots_insumos_id_seq'::regclass);


--
-- Name: sub_unidades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_unidades ALTER COLUMN id SET DEFAULT nextval('public.sub_unidades_id_seq'::regclass);


--
-- Name: tabla_hogar_constituido id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabla_hogar_constituido ALTER COLUMN id SET DEFAULT nextval('public.tabla_hogar_constituido_id_seq'::regclass);


--
-- Name: tabla_permanencia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabla_permanencia ALTER COLUMN id SET DEFAULT nextval('public.tabla_permanencia_id_seq'::regclass);


--
-- Name: tarifas_por_categoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas_por_categoria ALTER COLUMN id SET DEFAULT nextval('public.tarifas_por_categoria_id_seq'::regclass);


--
-- Name: tipos_beneficio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_beneficio ALTER COLUMN id SET DEFAULT nextval('public.tipos_beneficio_id_seq'::regclass);


--
-- Name: tipos_compensacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_compensacion ALTER COLUMN id SET DEFAULT nextval('public.tipos_compensacion_id_seq'::regclass);


--
-- Name: tipos_movimiento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_movimiento ALTER COLUMN id SET DEFAULT nextval('public.tipos_movimiento_id_seq'::regclass);


--
-- Name: tramos_sanidad_militar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramos_sanidad_militar ALTER COLUMN id SET DEFAULT nextval('public.tramos_sanidad_militar_id_seq'::regclass);


--
-- Name: unidades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades ALTER COLUMN id SET DEFAULT nextval('public.unidades_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Data for Name: acciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.acciones (id, nombre, descripcion) FROM stdin;
10	IniciarSesion	Inicio de sesión en el sistema
11	CerrarSesion	Cierre de sesión
12	CrearUsuario	Creación de nuevo usuario
13	ActualizarUsuario	Actualización de datos de usuario
14	CrearRol	Creación de nuevo rol
15	ActualizarRol	Actualización de rol
16	CrearPersonal	Alta de personal
17	ActualizarPersonal	Modificar datos de personal
18	BajaPersonal	Registrar baja de personal
19	AscensoPersonal	Registrar ascenso de personal
20	CrearCompensacion	Crear compensaciones
21	ActualizarCompensacion	Modificar compensaciones
22	CrearConfigCompensacion	Crear configuración de compensaciones
23	ActualizarConfigComprensacion	Modificar configuración de compensaciones
24	CrearLoteCompensacion	Crear lote de compensaciones
25	ActualizarLoteCompensacion	Modificar lote de compensaciones
26	EliminarLoteCompensacion	Eliminar lote de compensaciones
27	AprobarLoteCompensacion	Aprobar lote de compensaciones
28	RechazarLoteCompensacion	Rechazar lote de compensaciones
29	RevertirLoteCompensacion	Revertir lote de compensaciones
30	CrearItemLoteCompensacion	Crear ítem de lote de compensaciones
31	ActualizarItemLoteCompensacion	Modificar ítem de lote de compensaciones
32	EliminarItemLoteCompensacion	Eliminar ítem de lote de compensaciones
33	CrearBeneficio	Crear beneficio
34	ActualizarBeneficio	Modificar beneficio
35	EliminarBeneficio	Eliminar beneficio
36	ActivarBeneficio	Activar beneficio
37	DesactivarBeneficio	Desactivar beneficio
38	CrearFranja	Crear franja IRPF
39	ActualizarFranja	Modificar franja IRPF
40	EliminarFranja	Eliminar franja IRPF
41	CrearBanco	Crear banco
42	ActualizarBanco	Modificar banco
43	CrearTablaPermanencia	Crear rango de permanencia
44	ActualizarTablaPermanencia	Modificar rango de permanencia
45	EliminarTablaPermanencia	Eliminar rango de permanencia
46	CrearDependientes	Crear dependientes
47	ActualizarDependientes	Modificar dependientes
48	AbrirPeriodoLiquidacion	Apertura de período de liquidación
49	CrearNovedad	Crear novedad de período
50	ConfirmarNovedad	Confirmar novedad de período
51	AnularNovedad	Anular novedad de período
52	CerrarInsumosPeriodo	Cierre de insumos del período
53	ReabrirInsumosPeriodo	Reapertura de insumos del período
54	IniciarCalculoPeriodo	Inicio de cálculo del período
55	GenerarLiquidacion	Generación de liquidación de haberes
56	AplicarRetroactividades	Aplicación de retroactividades
57	CerrarPeriodo	Cierre de período de liquidación
58	CrearRetroactividad	Crear retroactividad
59	ConfirmarRetroactividad	Confirmar retroactividad
60	GenerarReporteEfectivosSuperior	Descarga CSV del cuadro de efectivos superior
61	GenerarReporteEfectivosSubalterno	Descarga CSV del cuadro de efectivos subalterno
62	GenerarReporteListin	Descarga CSV del listín de contralor
63	GenerarReporteComparativoSgh	Descarga CSV del comparativo SGH
64	GenerarReporteResumenPrograma	Descarga CSV del resumen por programa
65	GenerarReporteRubro083	Descarga CSV del reporte rubro 083
66	GenerarReportePadronRubro	Descarga CSV del padrón por rubro
67	GenerarReportePadronMensual	Descarga CSV del padrón mensual
68	GenerarReporteMovimientos	Descarga CSV del reporte de movimientos
69	GenerarReporteDiferencias	Descarga CSV del reporte de diferencias
70	GenerarReporteNoDisponibles	Descarga CSV del reporte de no disponibles
71	GenerarReciboIndividual	Generación de PDF de recibo individual
72	GenerarRecibosLote	Generación de recibos en lote por período
73	GenerarArchivoBrou	Generación de archivo de transferencias BROU
74	GenerarResumenSiif	Generación de resumen para SIIF
75	CrearAcreedor	Creación de un acreedor
76	ActualizarAcreedor	Modificación de un acreedor
77	CrearIrpf	Crear calculo mensual de IRPF
78	ActualizarIrpf	Actualizar calculo mensual de IRPF
79	CrearLoteAsiduidad	Creación de lote de Asiduidad de Vuelo
80	AprobarLoteAsiduidad	Aprobación de lote de Asiduidad de Vuelo
81	RechazarLoteAsiduidad	Rechazo de lote de Asiduidad de Vuelo
82	CrearLoteCarcel	Creación de lote Viático Cárceles
83	AprobarLoteCarcel	Aprobación de lote Viático Cárceles
84	CrearLoteFrontera	Creación de lote Compensación Fronteriza
85	AprobarLoteFrontera	Aprobación de lote Compensación Fronteriza
86	CrearLoteNocturnidad	Creación de lote Nocturnidad
87	AprobarLoteNocturnidad	Aprobación de lote Nocturnidad
88	CrearLotePan	Creación de lote Compensación PAN
89	AprobarLotePan	Aprobación de lote Compensación PAN
90	CrearLotePlanFrontera	Creación de lote Plan Frontera
91	AprobarLotePlanFrontera	Aprobación de lote Plan Frontera
92	CrearLoteIdoneidad	Creación de lote Prima de Idoneidad
93	AprobarLoteIdoneidad	Aprobación de lote Prima de Idoneidad
94	CrearLoteSar	Creación de lote Compensación SAR
95	AprobarLoteSar	Aprobación de lote Compensación SAR
96	CrearLoteVuelo	Creación de lote Riesgo de Vuelo
97	AprobarLoteVuelo	Aprobación de lote Riesgo de Vuelo
98	ActualizarParametrosPeriodo	Modificar parámetros de período de liquidación
99	ActualizarNovedad	Modificar novedad de período
100	EliminarBanco	Eliminar banco
101	EliminarNovedad	Eliminar novedad de período (borrador)
102	CrearForm3100	Crear formulario 3100
103	AdjuntarArchivoForm3100	Adjuntar archivo a formulario 3100
104	CrearDescuentoPersonal	Crear descuento personal
105	ActualizarDescuentoPersonal	Modificar descuento personal
106	EliminarDescuentoPersonal	Eliminar descuento personal
107	ConfirmarDescuentosPersonales	Confirmar descuentos personales del período
\.


--
-- Data for Name: acreedores; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.acreedores (id, codigo, nombre, formato_archivo, contacto, activo, categoria_deficit, orden_legal_deficit) FROM stdin;
1	RET_JUDICIAL	Retenciones judiciales alimenticias	txt	\N	t	retencion_judicial_alimenticia	1
2	ALQ_CGN	Alquiler CGN	txt	\N	t	garantia_alquiler	2
3	ALQ_ANDA	Alquiler ANDA	txt	\N	t	garantia_alquiler	2
4	ALQ_BOISO	Alquiler Boiso Lanza	txt	\N	t	garantia_alquiler	2
5	ALQ_MALVINAS	Alquiler Malvinas	txt	\N	t	garantia_alquiler	2
6	ALQ_MIRAMAR	Alquiler Miramar	txt	\N	t	garantia_alquiler	2
7	ALQ_COOP_TRANSP	Alquiler Cooperativa Transporte	txt	\N	t	garantia_alquiler	2
8	ALQ_COOP_MAG	Alquiler Cooperativa Magisterial	txt	\N	t	garantia_alquiler	2
9	ALQ_SURCO	Alquiler Surco	txt	\N	t	garantia_alquiler	2
10	BHU	Banco Hipotecario del Uruguay	txt	\N	t	vivienda	5
11	ANV	Agencia Nacional de Vivienda	txt	\N	t	vivienda	5
12	VIV_FAREA	Vivienda Fuerza Aerea	txt	\N	t	vivienda	5
13	VIV_FFAA_CREDIMAT	Servicio Vivienda FFAA Credimat	txt	\N	t	vivienda	5
14	VIV_FFAA_DEC250	Servicio Vivienda FFAA Decreto 250 UR	txt	\N	t	vivienda	5
15	BSE	Banco de Seguros del Estado	txt	\N	t	seguro_vida	6
16	SEGUROS_VIDA	Seguros de vida	txt	\N	t	seguro_vida	6
17	DNSFFAA	Direccion Nacional de Sanidad FFAA	txt	\N	t	salud_prepaga	7
18	CARNET_SANIDAD	Carnet de sanidad	txt	\N	t	salud_prepaga	7
19	UCM	UCM	txt	\N	t	salud_prepaga	7
20	SEMM	SEMM	txt	\N	t	salud_prepaga	7
21	CASMU	CASMU IAMPP	txt	\N	t	salud_prepaga	7
22	SANIDAD	Sanidad	txt	\N	t	salud_prepaga	7
23	SERV_SANIDAD_FAU	Servicios de Sanidad FAU	txt	\N	t	salud_prepaga	7
24	ANDA	ANDA creditos	txt	\N	t	credito_nomina_cooperativa	8
25	COOP_BANCARIA	Cooperativa Bancaria	txt	\N	t	credito_nomina_cooperativa	8
26	CNAYD	Caja Nacional de Ahorro y Descuento	txt	\N	t	credito_nomina_cooperativa	8
27	COFANS	COFANS	txt	\N	t	credito_nomina_cooperativa	8
28	CANTINAS_MIL	Cantinas Militares	txt	\N	t	credito_nomina_cooperativa	8
29	CACCSOE	CACCSOE	txt	\N	t	credito_nomina_cooperativa	8
30	COOPERATIVA	Retencion Cooperativa	txt	\N	t	credito_nomina_cooperativa	8
31	CAOFA	CAOFA	txt	\N	t	credito_nomina_cooperativa	8
32	COOP_ELECTORAL	Cooperativa Electoral	txt	\N	t	credito_nomina_cooperativa	8
33	COOP_POLICIAL	Cooperativa Policial	txt	\N	t	credito_nomina_cooperativa	8
34	FUCAC	FUCAC	txt	\N	t	credito_nomina_cooperativa	8
35	FUCEREP	FUCEREP	txt	\N	t	credito_nomina_cooperativa	8
36	CODAC	CODAC	txt	\N	t	credito_nomina_cooperativa	8
37	CAYCE	CAYCE	txt	\N	t	credito_nomina_cooperativa	8
38	CASH	CASH	txt	\N	t	credito_nomina_cooperativa	8
39	COFAC	COFAC	txt	\N	t	credito_nomina_cooperativa	8
40	COOPACE	COOPACE	txt	\N	t	credito_nomina_cooperativa	8
41	COMAJA	COMAJA	txt	\N	t	credito_nomina_cooperativa	8
42	COMAG	COMAG Consumo	txt	\N	t	credito_nomina_cooperativa	8
43	CINTEPA	CINTEPA	txt	\N	t	credito_nomina_cooperativa	8
44	COPAC	COPAC	txt	\N	t	credito_nomina_cooperativa	8
45	ACAC	ACAC	txt	\N	t	credito_nomina_cooperativa	8
46	CACCDI	CACCDI	txt	\N	t	credito_nomina_cooperativa	8
47	TGN	Tesoreria General de la Nacion	txt	\N	t	facilidad_pago_tributaria	9
48	MDN	Ministerio de Defensa Nacional	txt	\N	t	otras_retenciones	100
49	SUELDOS_RETIROS	Sueldos y Retiros	txt	\N	f	otras_retenciones	100
50	ORDEN	A la orden	txt	\N	t	otras_retenciones	100
51	DEVOLUCIONES	Devoluciones varias	txt	\N	t	otras_retenciones	100
52	COLECTIVO_CAP	Colectivo CAP	txt	\N	t	otras_retenciones	100
53	V_SER_TOLEDO	Vivienda Servicios Toledo	txt	\N	t	otras_retenciones	100
54	SERV_MANT_BAII	Servicio y mantenimiento BAII	txt	\N	t	otras_retenciones	100
55	SERV_MANT_MALV	Servicio y mantenimiento Malvinas	txt	\N	t	otras_retenciones	100
56	SERV_MANT_MIRAMAR	Servicio y mantenimiento Miramar	txt	\N	t	otras_retenciones	100
57	SERV_MANT_BOISO	Servicio y mantenimiento Boiso Lanza	txt	\N	t	otras_retenciones	100
58	FONDO_PREVISION	Fondo Prevision	txt	\N	t	otras_retenciones	100
59	CONTABLE	Contable	txt	\N	t	otras_retenciones	100
60	MISIONES	Misiones	txt	\N	t	otras_retenciones	100
61	CLUB_FUERZA_AEREA	Club Fuerza Aerea	txt	\N	t	otras_retenciones	100
62	CLUB_SSOO	Club SS.OO.	txt	\N	t	otras_retenciones	100
63	CIRCULO_FAREA	Circulo Fuerza Aerea	txt	\N	t	otras_retenciones	100
64	CSOM	CSOM	txt	\N	t	otras_retenciones	100
65	BIBLIOTECA_SSFFAA	Biblioteca SS.FF.AA.	txt	\N	t	otras_retenciones	100
66	GASTOS_ST	Gastos Santa Teresa	txt	\N	t	otras_retenciones	100
67	COMEDOR_SUBOFLS	Comedor Suboficiales	txt	\N	t	otras_retenciones	100
68	SERV_TRANSPORTE	Servicio Transporte	txt	\N	t	otras_retenciones	100
69	COLECTIVO_SOM	Colectivo SOM Comando General	txt	\N	t	otras_retenciones	100
70	CJPPU	Caja de Jubilaciones Profesionales	txt	\N	t	otras_retenciones	100
71	DINACIA	DINACIA	txt	\N	t	otras_retenciones	100
72	1170	CLUB NAVAL	txt	\N	t	otras_retenciones	100
73	1180	BAI	txt	\N	t	otras_retenciones	100
74	1402	FIESTA COMANDO	txt	\N	t	otras_retenciones	100
\.


--
-- Data for Name: aguinaldo_baja; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.aguinaldo_baja (id, persona_id, cedula, nombre_completo, fecha_baja, motivo_baja_codigo, anio, mes, semestre, total_haberes_gravados, meses_computados, mes_inicio_periodo, mes_fin_periodo, mes_liquidacion, nominal, irpf, montepio, sanidad, total_descuentos, liquido, redondeo, estado) FROM stdin;
\.


--
-- Data for Name: aguinaldos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.aguinaldos (id, persona_id, anio, semestre, total_haberes_gravados_semestre, meses_trabajados, irpf_aguinaldo, nominal, montepio, sanidad, total_descuentos, liquido, redondeo) FROM stdin;
\.


--
-- Data for Name: bancos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bancos (id, codigo, nombre, vigente) FROM stdin;
1	BROU	Banco de la República Oriental del Uruguay	t
\.


--
-- Data for Name: beneficio_social_beneficiarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.beneficio_social_beneficiarios (id, beneficio_id, nombre, apellido, cedula, fecha_nacimiento, discapacidad, vigente_desde, vigente_hasta, activo, creado_por, creado_en) FROM stdin;
\.


--
-- Data for Name: beneficios_sociales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.beneficios_sociales (id, persona_id, tipo_beneficio_id, cantidad, vigente_desde, vigente_hasta, estado, documento_respaldo, observaciones, creado_en, creado_por, fecha_evento, clave_evento, retroactividad_pendiente, subtipo) FROM stdin;
\.


--
-- Data for Name: bitacora_auditoria; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bitacora_auditoria (id, usuario_id, accion_id, contexto_id, host, fecha, entidad, entidad_id, detalle, aplicacion) FROM stdin;
\.


--
-- Data for Name: catalogo_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.catalogo_items (id, codigo, nombre, tipo, es_gravado, contribuye_w_para_5_3, contribuye_w_para_10, contribuye_w_para_20, contribuye_w_nominal, clasificacion_siif, formula_calculo, orden_calculo, item_par_ficto_id, norma_legal, acumula_aguinaldo, lleva_aumento, vigente) FROM stdin;
19	288	Plan Frontera (042.573)	haber_normal	f	f	f	f	f	042.573	prorrateo	10	\N	\N	f	f	t
20	270	Nocturnidad (052.001)	haber_normal	f	f	f	f	f	052.001	prorrateo	20	\N	\N	f	f	t
24	221	Prima por Idoneidad (042.092 FAU)	haber_normal	f	f	f	f	f	042.092	fijo	60	\N	\N	f	f	t
25	81	Viático Cárceles / Prima Seguridad Perimetral	haber_normal	f	f	f	f	f	042.000	por_grado	70	\N	\N	f	f	t
36	275	VIATICO EQUIPO OF. C/APORTES	haber_no_gravado	f	f	f	f	f	069.006	tabla_externa	162	\N	\N	f	f	t
37	276	VIATICO ALIM. PSUB C/APORTES	haber_no_gravado	f	f	f	f	f	069.008	tabla_externa	163	\N	\N	f	f	t
38	277	VIATICO DENTRO PAIS C/APORTES	haber_no_gravado	f	f	f	f	f	069.010	tabla_externa	164	\N	\N	f	f	t
46	517	I.R.P.F.	descuento_legal	f	f	f	f	f	1.089	tabla_externa	500	\N	\N	f	f	t
47	519	DNS FFAA TRAMO 1	descuento_legal	f	f	f	f	f	5.010	tabla_externa	501	\N	\N	f	f	t
48	520	DNS FFAA TRAMO 2	descuento_legal	f	f	f	f	f	5.011	tabla_externa	502	\N	\N	f	f	t
49	522	DNS FFAA TRAMO 3	descuento_legal	f	f	f	f	f	5.012	tabla_externa	503	\N	\N	f	f	t
50	550	MONT. PERS. SUB / MONTEPIO	descuento_legal	f	f	f	f	f	5.04	tabla_externa	504	\N	\N	f	f	t
51	540	SERV. ESP. TUT. SOC.	descuento_legal	f	f	f	f	f	5.08	tabla_externa	505	\N	\N	f	f	t
52	372	SERV. COMEDOR (ficto IRPF)	ficto_descuento	f	f	f	f	f	SCOMEDO	fijo	0	53	Sistema legado FoxPro SUM33333/SUM37150	f	f	t
53	608	SERV. COMEDOR ALIMENTO	descuento_personal	f	f	f	f	f	SCOMEDO	fijo	0	52	Sistema legado FoxPro SUM37150	f	f	t
56	1300	BIBLIOTECA COMGFA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	602	\N	\N	f	f	t
62	42615	DIFERENCIA POR ASCENSOS (042.615)	haber_normal	f	f	f	f	f	042.615	tabla_externa	176	\N	\N	f	f	t
45	300	ASIGNACION FAMILIAR	beneficio_social_no_grav	f	f	f	f	t	074.000	tabla_externa	171	\N	\N	f	f	t
61	42511	BARRERA SANITARIA (042.511)	haber_normal	t	f	f	f	t	042.511	prorrateo	75	\N	\N	f	f	t
77	90000	Ajuste por Redondeo	ajuste	f	f	f	f	f	\N	\N	0	\N	\N	f	f	t
78	5010	SANIDAD 0 A 2.5 BPC	descuento_legal	f	f	f	f	f	5.10	tabla_externa	0	\N	\N	f	f	t
79	5011	SANIDAD 2.5 A 5 BPC	descuento_legal	f	f	f	f	f	5.11	tabla_externa	0	\N	\N	f	f	t
80	5012	SANIDAD > 5 BPC	descuento_legal	f	f	f	f	f	5.12	tabla_externa	0	\N	\N	f	f	t
81	690	D.N.S.FF.AA.	descuento_legal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	690	\N	\N	f	f	t
82	691	D.N.S.FF.AA.	descuento_legal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	691	\N	\N	f	f	t
83	692	D.N.S.FF.AA.	descuento_legal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	692	\N	\N	f	f	t
84	693	CARNET DE SANIDAD	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	693	\N	\N	f	f	t
85	694	CARNET SS.FF.AA.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	694	\N	\N	f	f	t
86	695	DEVOLUCION A MDN DE AGRE. AER.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	695	\N	\N	f	f	t
87	696	DEVOLUCION SUELDOS Y RETIROS	descuento_legal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	696	\N	\N	f	f	t
54	700	RETENCION JUDICIAL	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	700	\N	\N	f	f	t
89	701	RET.JUD. RETRO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	701	\N	\N	f	f	t
90	702	DEVOLUCION TGN	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	702	\N	\N	f	f	t
91	703	DEV. PERM. A LA ORDEN	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	703	\N	\N	f	f	t
92	704	RETENCION JUDICIAL	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	704	\N	\N	f	f	t
93	705	DIF AJUSTE DE RET	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	705	\N	\N	f	f	t
94	706	DIF. RET.JUDICIAL	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	706	\N	\N	f	f	t
95	708	ADELANTO RET JUD	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	708	\N	\N	f	f	t
96	710	ALQUILER C.G.N.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	710	\N	\N	f	f	t
97	711	RET VIVIENDA CACCSOE	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	711	\N	\N	f	f	t
98	712	ALQUILER A.N.D.A.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	712	\N	\N	f	f	t
99	713	BANCO HIPOTECARIO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	713	\N	\N	f	f	t
100	714	AGENCIA NACIONAL DE VIVIENDA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	714	\N	\N	f	f	t
101	715	C.N.A.Y D. 1101	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	715	\N	\N	f	f	t
102	716	C.N.A.Y D. 1102	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	716	\N	\N	f	f	t
103	717	C.N.A.Y D. 11101	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	717	\N	\N	f	f	t
104	718	C.N.A.Y D. 11102	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	718	\N	\N	f	f	t
105	725	ALQ.BOISO LANZA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	725	\N	\N	f	f	t
106	726	ALQ. MALVINAS	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	726	\N	\N	f	f	t
107	727	ALQ.MIRAMAR	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	727	\N	\N	f	f	t
108	728	DEV.VIATICOS	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	728	\N	\N	f	f	t
109	729	BCO HIPOTECARIO (VIEJO)	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	729	\N	\N	f	f	t
110	730	ALQUILER COOP TRANSP.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	730	\N	\N	f	f	t
111	731	VIVIENDA F.AEREA	descuento_personal	f	f	f	f	f	VIVIENDA	tabla_externa	731	\N	Sistema legado FoxPro cod.731	f	f	t
112	732	S VIV.FF.AA. CREDIMAT	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	732	\N	\N	f	f	t
113	733	S.VIV.FF.AA. DEC.250 UR	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	733	\N	\N	f	f	t
114	734	ALQ COOP MAGISTERIAL	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	734	\N	\N	f	f	t
115	735	RETENC.COOPERATIVA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	735	\N	\N	f	f	t
116	736	ALQUILER COOP TRANSP	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	736	\N	\N	f	f	t
117	737	UCM	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	737	\N	\N	f	f	t
118	738	SEM M	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	738	\N	\N	f	f	t
119	739	ALQUILER SURCO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	739	\N	\N	f	f	t
120	740	CASMU IAMPP	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	740	\N	\N	f	f	t
121	741	COLECTIVO CAP	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	741	\N	\N	f	f	t
122	742	V. SER. TOLEDO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	742	\N	\N	f	f	t
123	770	ANDA HASTA 05/14	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	770	\N	\N	f	f	t
124	790	ANDA CREDITOS	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	790	\N	\N	f	f	t
125	791	COOP BANCARIA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	791	\N	\N	f	f	t
126	792	ANDA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	792	\N	\N	f	f	t
55	793	COFANS	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	793	\N	\N	f	f	t
128	794	CANTINAS MILITARES	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	794	\N	\N	f	f	t
129	800	SERV Y MANT. BAII	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	800	\N	\N	f	f	t
130	802	SER MANT MALVINAS	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	802	\N	\N	f	f	t
131	803	SER MANT MIRAMAR	descuento_personal	f	f	f	f	f	SERMANTMIR	tabla_externa	803	\N	Sistema legado FoxPro cod.803	f	f	t
132	804	SER Y MANT B.LANZA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	804	\N	\N	f	f	t
70	360	Asignación por Discapacidad	beneficio_social_grav	t	f	f	f	t	074.001	tabla_externa	0	\N	\N	f	f	t
63	43002	COMPLEMENTO COMP. DEDICACION INTEGRAL (043.002)	haber_normal	t	f	f	f	t	043.002	por_grado	167	\N	\N	f	f	t
133	805	SERV MANT.BAII QC-4	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	805	\N	\N	f	f	t
134	806	SERV MANT.BAII QC-7	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	806	\N	\N	f	f	t
135	810	DEV 50% FONDO PREVISION	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	810	\N	\N	f	f	t
136	811	CONTABLE	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	811	\N	\N	f	f	t
137	812	MISIONES	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	812	\N	\N	f	f	t
138	813	SANIDAD	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	813	\N	\N	f	f	t
139	830	CACCDI	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	830	\N	\N	f	f	t
140	840	COFANS VIEJO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	840	\N	\N	f	f	t
141	841	CANTINA MILITAR HASTA-05/14	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	841	\N	\N	f	f	t
142	842	CLUB FUERZA AEREA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	842	\N	\N	f	f	t
143	845	DEV.SUELDO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	845	\N	\N	f	f	t
144	850	CAOFA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	850	\N	\N	f	f	t
145	851	CAOFA DIF FEBRERO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	851	\N	\N	f	f	t
146	860	CACCSOE	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	860	\N	\N	f	f	t
147	870	A.N.D.A. VIEJO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	870	\N	\N	f	f	t
148	880	COOPERATIVA ELECTORAL	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	880	\N	\N	f	f	t
149	890	COOPERATIVA POLICIAL	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	890	\N	\N	f	f	t
150	900	FUCAC	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	900	\N	\N	f	f	t
151	901	FUCEREP	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	901	\N	\N	f	f	t
152	910	CODAC	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	910	\N	\N	f	f	t
153	911	C.A.Y.C.E	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	911	\N	\N	f	f	t
154	912	CASH MARZO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	912	\N	\N	f	f	t
155	913	CASH	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	913	\N	\N	f	f	t
156	914	COFAC	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	914	\N	\N	f	f	t
157	915	COOPACE	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	915	\N	\N	f	f	t
158	916	COMAJA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	916	\N	\N	f	f	t
159	917	COMAG CONSUMO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	917	\N	\N	f	f	t
160	918	CINTEPA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	918	\N	\N	f	f	t
161	919	COPAC	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	919	\N	\N	f	f	t
162	920	BANCO DE SEGUROS	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	920	\N	\N	f	f	t
163	921	SEGUROS DE VIDA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	921	\N	\N	f	f	t
164	922	ACAC	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	922	\N	\N	f	f	t
165	923	CJPPU	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	923	\N	\N	f	f	t
166	927	CIRCULO F.AEREA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	927	\N	\N	f	f	t
167	930	SERV.SANIDAD FAU	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	930	\N	\N	f	f	t
168	985	CSOM NOVIEMBRE	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	985	\N	\N	f	f	t
169	989	BIBLIOTECA SS.FF.AA.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	989	\N	\N	f	f	t
170	990	CSOM	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	990	\N	\N	f	f	t
171	991	D.N.S.FF.AA.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	991	\N	\N	f	f	t
172	992	DNSFFAA>21	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	992	\N	\N	f	f	t
173	993	CARNET SS.FF.AA.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	993	\N	\N	f	f	t
174	994	GASTOS SANTA TERESA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	994	\N	\N	f	f	t
175	995	CLUB SS.OO. FEBRERO	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	995	\N	\N	f	f	t
176	996	CLUB SS.OO.	descuento_personal	f	f	f	f	f	CLUBSSOO	tabla_externa	996	\N	Sistema legado FoxPro cod.996	f	f	t
177	997	CUOTA COMEDOR SUB OFLS	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	997	\N	\N	f	f	t
178	998	SERV.TRANSPORTE	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	998	\N	\N	f	f	t
179	999	COLECT. SOM CDO.GRAL.	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	999	\N	\N	f	f	t
21	150	Asiduidad de Vuelo (042.553)	haber_normal	t	t	t	t	t	042.553	tarifa_categoria	30	\N	\N	f	f	t
22	283	SAR - Tarea de Rescatistas (042.572)	haber_normal	t	t	t	t	t	042.572	tarifa_categoria	40	\N	\N	f	f	t
23	284	PAN - Plan Alimentación Nacional (042.571)	haber_normal	t	t	t	t	t	042.571	fijo	50	\N	\N	f	f	t
41	330	PRIMA SOLIDARIA FAMILIAR	beneficio_social_no_grav	f	f	f	f	f	079.001	tabla_externa	167	\N	\N	f	f	t
42	320	HOGAR CONSTITUIDO	beneficio_social_no_grav	f	f	f	f	t	072.000	tabla_externa	168	\N	\N	f	f	t
44	340	PRIMA POR NACIMIENTO	beneficio_social_no_grav	f	f	f	f	f	073.000	fijo	170	\N	\N	f	f	t
43	350	PRIMA POR MATRIMONIO	beneficio_social_no_grav	f	f	f	f	f	071.000	fijo	169	\N	\N	f	f	t
26	210	COMP PERS #400 Y 250	haber_normal	t	t	t	t	t	048.018	tabla_externa	80	\N	\N	f	f	t
28	40	PERMANENCIA EN EL GRADO	haber_normal	t	f	f	f	t	041.003	tabla_externa	145	\N	\N	f	f	t
29	53	COMPENSACION 5.3%	haber_normal	t	f	f	f	t	048.012	tabla_externa	155	\N	\N	f	f	t
30	58	DEDICACION INTEGRAL	haber_normal	t	f	f	f	t	043.004	tabla_externa	156	\N	\N	f	f	t
32	165	AUMENTO ESPECIAL	haber_normal	t	f	f	f	t	048.004	fijo	158	\N	\N	f	f	t
33	170	PARTIDA FIJA / AUMENTO 92	haber_normal	t	f	f	f	t	048.009	fijo	159	\N	\N	f	f	t
34	213	REINTEGRO DE APORTE 2021	haber_normal	t	f	f	f	t	042.414	fijo	160	\N	\N	f	f	t
35	230	COMP. DEDICACION INTEGRAL	haber_normal	t	f	f	f	t	045.002	tabla_externa	161	\N	\N	f	f	t
64	59000	SUELDO ANUAL COMPLEMENTARIO (059.000)	haber_normal	t	f	f	f	t	059.000	tabla_externa	177	\N	\N	f	f	t
74	42623	Compensación Personal (Civiles 2023)	haber_normal	t	f	f	f	t	042.623	por_grado	0	\N	\N	f	f	t
190	42553	Compensación Especial por Asiduidad de Vuelo (042.553)	haber_normal	t	f	f	f	t	042.553	tabla_externa	130	\N	\N	f	f	t
57	370	PRIMA POR TRASLADO	beneficio_social_no_grav	t	f	f	f	t	066.000	\N	0	\N	\N	f	f	t
7	42019	RIESGO DE VUELO	haber_normal	t	f	f	f	t	042.019	por_grado	70	\N	\N	f	f	t
31	60	PERMANENCIA A LA ORDEN	haber_normal	t	f	f	f	t	042.014	tabla_externa	157	\N	\N	f	f	t
5	48015	AUM.LEY 17.269	haber_normal	t	f	f	f	t	048.015	por_grado	50	\N	\N	f	f	t
60	42413	MOD. APORTES LEY 19.695 MDN (042.413)	haber_normal	t	f	f	f	t	042.413	tabla_externa	175	\N	\N	f	f	t
4	42103	Compensación Combatientes (042.103)	haber_normal	t	f	f	f	t	042.103	por_grado	40	\N	\N	f	f	t
2	42012	Compensación Especial (042.012)	haber_normal	t	f	f	f	t	042.012	por_grado	20	\N	\N	f	f	t
9	48023	Prima (048.023)	haber_normal	t	f	f	f	t	048.023	por_grado	90	\N	\N	f	f	t
11	48042	Prima (048.042)	haber_normal	t	f	f	f	t	048.042	por_grado	110	\N	\N	f	f	t
76	69010	Viático por Traslado	haber_no_gravado	t	f	f	f	t	069.010	por_grado	0	\N	\N	f	f	t
14	44001	Progresivos / Permanencia en el Grado (044.001)	haber_normal	t	f	f	f	t	044.001	por_grado	140	\N	\N	f	f	t
1	11000	Sueldo Base Militar	haber_normal	t	f	f	f	t	011.000	por_grado	10	\N	\N	f	f	t
18	48040	Prima (048.040)	haber_normal	t	f	f	f	t	048.040	por_grado	180	\N	\N	f	f	t
16	42092	Prima Técnica (042.092)	haber_normal	t	f	f	f	t	042.092	por_grado	160	\N	\N	f	f	t
39	299	COMP. DI OFICIAL	haber_normal	t	f	f	f	t	043.003	tabla_externa	165	\N	\N	f	f	t
40	315	COMP. DI SUBALTERNO	haber_normal	t	f	f	f	t	043.003	tabla_externa	166	\N	\N	f	f	t
59	42093	Prima Idoneidad (042.093)	haber_normal	t	f	f	f	t	042.093	por_grado	161	\N	\N	f	f	t
12	42403	Art. 80 ley 20.075	haber_normal	t	f	f	f	t	042.403	por_grado	120	\N	\N	f	f	t
3	42536	PART.LEY 18834 ART	haber_normal	t	f	f	f	t	042.536	por_grado	30	\N	\N	f	f	t
71	42414	REINTEGRO DE APORTE	haber_no_gravado	f	f	f	f	t	042.414	tabla_externa	160	\N	\N	f	f	t
58	15000	GASTOS DE REPRESENTACION (015.000)	haber_normal	t	t	t	f	t	015.000	por_grado	12	\N	\N	f	f	t
15	42025	Prima Técnica Permanente (042.025)	haber_normal	t	f	f	f	t	042.025	por_grado	45	\N	\N	f	f	t
13	42022	Compensación Suboficiales (042.022)	haber_normal	t	f	f	f	t	042.022	por_grado	22	\N	\N	f	f	t
188	69008	Viático en el País Personal Subalterno (069.008)	haber_no_gravado	t	f	f	f	t	069.008	por_grado	120	\N	\N	f	f	t
72	42571	Compensación PAN	haber_normal	t	f	f	f	t	042.571	por_grado	0	\N	\N	f	f	t
73	42572	Compensación SAR	haber_normal	t	f	f	f	t	042.572	por_grado	0	\N	\N	f	f	t
192	43004	Dedicación Integral (043.004)	haber_normal	t	f	f	f	t	043.004	tabla_externa	150	\N	\N	f	f	t
193	41003	Permanencia en el Grado (041.003)	haber_normal	t	f	f	f	t	041.003	tabla_externa	48	\N	\N	f	f	t
27	20	SUELDO RESERVA JORNAL	haber_normal	t	t	t	f	t	011.001	por_grado	11	\N	\N	f	f	t
191	48012	COMPENSACION 5.3%	haber_normal	t	f	f	f	t	048.012	tabla_externa	155	\N	\N	f	f	t
184	48004	AUM. ESPEC./85 MIL	haber_normal	t	f	f	f	t	048.004	por_grado	158	\N	\N	f	f	t
185	48009	AUMENTO ESPEC./92	haber_normal	t	f	f	f	t	048.009	por_grado	159	\N	\N	f	f	t
10	48026	Recup. Salarial 1/1	haber_normal	t	f	f	f	t	048.026	por_grado	100	\N	\N	f	f	t
6	48038	PART.ESP. LEY 18719	haber_normal	t	f	f	f	t	048.038	por_grado	60	\N	\N	f	f	t
17	42067	EQUIPO OFICIALES	haber_normal	t	f	f	f	t	042.067	por_grado	170	\N	\N	f	f	t
8	48017	AUMENTO DEC.191/200	haber_normal	t	f	f	f	t	048.017	por_grado	80	\N	\N	f	f	t
75	69006	Dif.Equipo SSOO	haber_no_gravado	f	f	f	f	t	069.006	por_grado	162	\N	\N	f	f	t
207	1261	DINACIA	descuento_personal	f	f	f	f	f	PENDIENTE_FAU	tabla_externa	1261	\N	\N	f	f	t
208	69005	Dif.Equipo Of. s/aportes	haber_no_gravado	f	f	f	f	t	069.005	por_grado	163	\N	\N	f	f	t
209	69009	Viáticos s/aportes	haber_no_gravado	f	f	f	f	t	069.009	por_grado	164	\N	\N	f	f	t
210	375	GUARDERIA (ficto IRPF)	ficto_descuento	f	f	f	f	f	GUARDERIA	fijo	0	211	Sistema legado FoxPro SUM33333/SUM37150	f	f	t
211	614	GUARDERIA	descuento_personal	f	f	f	f	f	GUARDERIA	fijo	0	210	Sistema legado FoxPro SUM37150	f	f	t
212	376	TICKET ALIMENTACION (ficto IRPF)	ficto_descuento	f	f	f	f	f	TICKET	fijo	0	213	Sistema legado FoxPro CARBOTIK/LIQ_MDN	f	f	t
213	618	TICKET ALIMENTACION	descuento_personal	f	f	f	f	f	TICKET	fijo	0	212	Sistema legado FoxPro SUM37150/LIQ_MDN	f	f	t
214	1170	CLUB NAVAL	descuento_personal	f	f	f	f	f	CLUBNAVAL	fijo	0	\N	Sistema legado FoxPro cod.1170	f	f	t
215	1180	BAI	descuento_personal	f	f	f	f	f	BAI	fijo	0	\N	Sistema legado FoxPro cod.1180	f	f	t
216	1402	FIESTA COMANDO	descuento_personal	f	f	f	f	f	FIESTACDO	fijo	0	\N	Sistema legado FoxPro cod.1402	f	f	t
\.


--
-- Data for Name: cierres; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cierres (id, liquidacion_id, tipo, estado, fecha_cierre, cerrado_por, hash_datos, observaciones) FROM stdin;
\.


--
-- Data for Name: compensaciones_diferencia_ascenso; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compensaciones_diferencia_ascenso (id, persona_id, relacion_laboral_nueva_id, periodo_id, grado_viejo_id, grado_nuevo_id, monto, dias_desde_ascenso, tiene_permanencia, fecha_ascenso, estado, incidencias, creado_en) FROM stdin;
\.


--
-- Data for Name: config_compensaciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.config_compensaciones (id, tipo_compensacion_id, regimen_id, grado_id, escalafon_id, funcion, unidad_medida, formula, valor_por_unidad, monto, tope, tope_unidades, valor_minimo, valor_maximo, sujeto_desc_legales, catalogo_item_id, vigente_desde, vigente_hasta, activo) FROM stdin;
1	1	\N	\N	\N	\N	dia	prorrateo	\N	\N	\N	15	\N	\N	f	61	2026-01-01	\N	t
2	2	\N	\N	\N	\N	monto	rango	\N	\N	\N	1	6955.61	24346.96	t	190	2026-01-01	\N	t
3	3	\N	\N	\N	\N	dia	tabla	\N	\N	\N	\N	\N	\N	t	25	2026-01-01	\N	t
6	6	\N	\N	\N	\N	monto	fijo	\N	10434.03	\N	1	\N	\N	t	72	2026-01-01	\N	t
7	7	\N	\N	\N	\N	dia	prorrateo	974.16	\N	\N	\N	\N	\N	t	19	2026-01-01	\N	t
8	8	\N	\N	\N	\N	monto	fijo	\N	6742.72	\N	1	\N	\N	t	24	2026-01-01	\N	t
9	9	\N	\N	\N	\N	monto	presupuesto	\N	\N	\N	1	\N	\N	t	73	2026-01-01	\N	t
10	10	\N	\N	\N	\N	monto	presupuesto	\N	\N	\N	1	\N	\N	t	7	2026-01-01	\N	t
5	5	\N	\N	\N	\N	dia	prorrateo	294.63	\N	\N	\N	\N	\N	t	20	2026-01-01	\N	t
\.


--
-- Data for Name: contextos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.contextos (id, nombre, descripcion) FROM stdin;
1	Autenticacion	Operaciones de autenticación
2	Sistema	Operaciones del sistema
3	Usuarios	Gestión de usuarios
4	Roles	Gestión de roles y permisos
5	Personal	Gestión de personal
6	Liquidaciones	Gestión de liquidaciones
7	Compensaciones	Gestión de compensaciones
8	Descuentos	Gestión de descuentos
9	Beneficios	Gestión de beneficios
10	IRPF	Gestión de IRPF
11	Bancos	Gestión de bancos
12	Dependientes	Gestión de dependientes
13	Novedades	Novedades de período
14	Retroactividades	Retroactividades de período
15	Ascensos	Operaciones de ascensos automáticos
16	Acreedores	Gestión de acreedores
\.


--
-- Data for Name: cuentas_bancarias; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cuentas_bancarias (id, persona_id, banco_id, numero_cuenta, estado) FROM stdin;
\.


--
-- Data for Name: dependientes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dependientes (id, persona_id, tipo, nombre, cedula, fecha_nacimiento, discapacitado, porcentaje_deduccion, vigente_desde, vigente_hasta, activo) FROM stdin;
\.


--
-- Data for Name: descuentos_personal_periodo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.descuentos_personal_periodo (id, periodo_id, persona_id, catalogo_item_id, importe, estado, observaciones, fecha_creacion, usuario_creacion_id, monto_aplicado, monto_no_aplicado, enviada_acreedor_en, acreedor_id, fecha_comunicacion, fecha_hasta) FROM stdin;
\.


--
-- Data for Name: descuentos_personales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.descuentos_personales (id, persona_id, acreedor_id, liquidacion_id, tipo, monto_solicitado, monto_aplicado, estado, periodo_anio, periodo_mes, fecha_importacion, archivo_origen, enviada_acreedor_en, observaciones) FROM stdin;
\.


--
-- Data for Name: documentos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documentos (id, tipo, entidad_id, ruta_relativa, nombre_original, content_type, tamanio_bytes, fecha_carga, usuario_carga_id) FROM stdin;
\.


--
-- Data for Name: escalafones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.escalafones (id, codigo, denominacion, vigente) FROM stdin;
1	AV	(Av.)	t
2	NAV	(Nav.)	t
3	TP	(T.P.)	t
4	ESP	(Esp.)	t
5	SG	(S.G.)	t
6	AA	(A.A.)	t
7	RVA	(Rva.)	t
8	MANT	(Mant.)	t
9	CYE	(C.y E.)	t
10	MET	(Met.)	t
11	SA	(S.A.)	t
12	BM	(B.M.)	t
13	ST	(S.T.)	t
14	AT	(A.T.)	t
15	ESC_3	Escalafón 3 (pendiente identificar)	t
16	ESC_9	Escalafón 9 (pendiente identificar)	t
17	ESC_11	Escalafón 11 (pendiente identificar)	t
\.


--
-- Data for Name: form3100; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.form3100 (id, persona_id, cappu_categoria, fondo_solidaridad, adicional_fondo_solidaridad, aplica_minimo_no_imponible, conyuge_nombre, conyuge_apellido, conyuge_fecha_nacimiento, conyuge_cedula, conyuge_sexo, conyuge_nacionalidad, vigente_desde_mes, vigente_desde_anio, documento_id, fecha_creacion, usuario_creacion_id) FROM stdin;
\.


--
-- Data for Name: form3100_personas_cargo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.form3100_personas_cargo (id, form3100_id, nombre, apellido, fecha_nacimiento, cedula, sexo, porcentaje_atribucion, relacion, discapacidad) FROM stdin;
\.


--
-- Data for Name: franjas_irpf; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.franjas_irpf (id, numero_franja, desde_bpc, hasta_bpc, tasa, vigente_desde, vigente_hasta) FROM stdin;
1	1	0.00	7.00	0.0000	2025-01-01	\N
2	2	7.00	10.00	0.1000	2025-01-01	\N
3	3	10.00	15.00	0.1500	2025-01-01	\N
4	4	15.00	30.00	0.2400	2025-01-01	\N
5	5	30.00	50.00	0.2500	2025-01-01	\N
6	6	50.00	75.00	0.2700	2025-01-01	\N
7	7	75.00	\N	0.3600	2025-01-01	\N
8	1	0.00	7.00	0.0000	2026-01-01	\N
9	2	7.00	10.00	0.1000	2026-01-01	\N
10	3	10.00	15.00	0.1500	2026-01-01	\N
11	4	15.00	30.00	0.2400	2026-01-01	\N
12	5	30.00	50.00	0.2500	2026-01-01	\N
13	6	50.00	75.00	0.2700	2026-01-01	\N
14	7	75.00	115.00	0.3100	2026-01-01	\N
15	8	115.00	\N	0.3600	2026-01-01	\N
\.


--
-- Data for Name: grados; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.grados (id, codigo, escalafon_id, denominacion, orden, vigente, es_oficial, es_subalterno) FROM stdin;
1	SDO_1RA	\N	Sdo. 1ª	1	t	f	t
2	CBO_2DA	\N	Cbo. 2ª	2	t	f	t
3	CBO_1RA	\N	Cbo. 1ª	3	t	f	t
4	SGTO	\N	Sgto.	4	t	f	t
5	SGTO_1RO	\N	Sgto. 1°	5	t	f	t
6	SOM	\N	S.O.M.	6	t	f	t
7	ALF	\N	Alf.	7	t	t	f
8	TTE_2DO	\N	Tte. 2°	8	t	t	f
9	TTE_1RO	\N	Tte. 1°	9	t	t	f
10	CAP	\N	Cap.	10	t	t	f
11	MAY	\N	May.	11	t	t	f
12	TTE_CNEL	\N	Tte. Cnel.	12	t	t	f
13	CNEL	\N	Cnel.	13	t	t	f
14	BRIG_GRAL	\N	Brig. Gral.	14	t	t	f
15	GRAL	\N	Gral. Del Aire	15	t	t	f
16	CAD_ASP	\N	Cad. Asp.	16	t	f	f
17	CAD_1RO	\N	Cad. 1°	17	t	f	f
18	CAD_2DO	\N	Cad. 2°	18	t	f	f
19	CAD_3RO	\N	Cad. 3°	19	t	f	f
20	AT_2DA	\N	At. 2ª	20	t	f	f
21	AT_1RA	\N	At. 1ª	21	t	f	f
22	AT_PPAL	\N	At. Ppal.	22	t	f	f
23	INST_AT	\N	Inst. At.	23	t	f	f
24	SUP_AT	\N	Sup. At.	24	t	f	f
25	SDO_2DA	\N	Sdo. 2ª	0	t	f	t
26	APRENDIZ	\N	Aprendiz	0	t	f	t
27	CADETE_1RA	\N	Cadete 1ª y Equivalentes	0	t	f	t
28	CADETE_2DA	\N	Cadete 2ª y Equivalentes	0	t	f	t
29	CADETE_3RA	\N	Cadete 3ª y Equivalentes	0	t	f	t
30	CADETE_ASP	\N	Cadete - Aspirante	0	t	f	t
31	CADETE_EQV	\N	Cadete Equivalente	0	t	f	t
\.


--
-- Data for Name: historico_liquidaciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.historico_liquidaciones (id, persona_id, anio, mes, haberes_gravados, situacion_id, grado_id, escalafon_id, unidad_id, programa_id, regimen_id, origen, fecha_creacion) FROM stdin;
\.


--
-- Data for Name: incidencias_calculo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.incidencias_calculo (id, periodo_id, version, persona_id, tipo, descripcion, creado_en) FROM stdin;
\.


--
-- Data for Name: instructivo_asig_familiar; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.instructivo_asig_familiar (id, tipo_franja, importe, vigente_desde, descripcion_porcentaje) FROM stdin;
1	franja_8	549.12	2026-01-01	8%
2	franja_16	1098.24	2026-01-01	16%
3	discapacidad	2196.48	2026-01-01	32%
\.


--
-- Data for Name: instructivo_psf; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.instructivo_psf (id, numero_categoria, descripcion, importe, vigente_desde) FROM stdin;
1	1	Soltero sin hijos	389.77	2026-01-01
2	2	Casado sin hijos	779.41	2026-01-01
3	3	Con 1 hijo	1169.23	2026-01-01
4	4	Con 2 hijos	1367.35	2026-01-01
5	5	Con 3 o más hijos	1566.00	2026-01-01
\.


--
-- Data for Name: irpf_detalle_franjas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.irpf_detalle_franjas (id, irpf_mensual_id, franja_irpf_id, base_en_franja, tasa, impuesto) FROM stdin;
\.


--
-- Data for Name: irpf_mensual; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.irpf_mensual (id, liquidacion_id, persona_id, ingresos_gravados, deduccion_aportes, deduccion_hijos, deduccion_conyuge, deduccion_profesional, tasa_deduccion_profesional, total_deducciones, base_imponible_neta, total_irpf) FROM stdin;
\.


--
-- Data for Name: items_aguinaldo_baja; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.items_aguinaldo_baja (id, aguinaldo_baja_id, codigo_concepto, nombre_concepto, importe, tipo) FROM stdin;
\.


--
-- Data for Name: items_liquidacion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.items_liquidacion (id, liquidacion_id, persona_id, relacion_laboral_id, catalogo_item_id, codigo_item, monto, base_calculo, tasa_aplicada, regla_aplicada, es_retroactividad, estado) FROM stdin;
\.


--
-- Data for Name: items_lote_compensacion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.items_lote_compensacion (id, lote_compensacion_id, persona_id, unidad_cantidad, monto, estado, incidencia, observaciones, funcion, sujeto_desc_legales, snapshot_grado_id, snapshot_situacion_id, snapshot_unidad_id, ala, categoria_compensacion, snapshot_programa_id) FROM stdin;
\.


--
-- Data for Name: liquidacion_estados_personal; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.liquidacion_estados_personal (id, periodo_id, cedula, version, estado, mensaje_error, fecha_actualizacion) FROM stdin;
\.


--
-- Data for Name: liquidacion_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.liquidacion_items (id, periodo_id, cedula, version, codigo_concepto, nombre_concepto, importe, rubro_contable, objeto_gasto, programa_id, regimen_id, rubro_083, fecha_creacion, clave_evento) FROM stdin;
\.


--
-- Data for Name: liquidacion_resumenes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.liquidacion_resumenes (id, periodo_id, version, programa_id, regimen_id, rubro_083, total_importe, descripcion) FROM stdin;
\.


--
-- Data for Name: liquidaciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.liquidaciones (id, anio, mes, version, estado, parametros_periodo_id, abierta_por, abierta_en, calculada_en, cerrada_por, cerrada_en, observaciones) FROM stdin;
\.


--
-- Data for Name: lotes_compensacion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lotes_compensacion (id, tipo_compensacion_id, estado, fuente, nombre_archivo, hash_archivo, usuario_id, creado_en, aprobado_por, aprobado_en, periodo_id) FROM stdin;
\.


--
-- Data for Name: motivos_baja; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.motivos_baja (id, codigo, denominacion, vigente) FROM stdin;
1	RETIRO_OBL	Baja por retiro obligatorio.	t
2	RETIRO_VOL	Baja por retiro voluntario.	t
3	BAJA_DEFINITIVA	Baja definitiva.	t
4	FALLECIMIENTO	Baja por fallecimiento.	t
5	MALA_CONDUCTA	Recisión por mala conducta.	t
6	TERMINO_CONTRATO	Baja por término de contrato.	t
7	INCAPACIDAD	Baja por incapacidad.	t
8	CESE	Baja por cese.	t
9	DESTITUCION	Baja por destitución.	t
10	ESPECIAL_CADETE	Baja especial MDN ( baja por ser alta como cadete).	t
11	ESPECIAL_APRENDIZ	Baja especial MDN ( baja por ser alta como aprendiz).	t
\.


--
-- Data for Name: movimientos_laborales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.movimientos_laborales (id, relacion_laboral_id, tipo_movimiento_id, fecha_movimiento, retroactivo_desde, usuario_id, observaciones, es_automatico, creado_en, puesto, plaza) FROM stdin;
\.


--
-- Data for Name: novedades_periodo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.novedades_periodo (id, periodo_id, persona_id, tipo, dias_afectados, porcentaje_subsidio, fecha_desde, fecha_hasta, observaciones, estado, creado_por, creado_en, confirmado_por, confirmado_en) FROM stdin;
\.


--
-- Data for Name: parametros_periodo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.parametros_periodo (id, anio, mes, bpc_anual, tasa_montepio_ley_vieja, tasa_montepio_ley_nueva, tasa_fonasa, tasa_frl, umbral_deduccion_bpc, tasa_deduccion_alta, tasa_deduccion_baja, porcentaje_minimo_deficit, tasa_aporte_civil, creado_por, creado_en, tasa_tutela_social) FROM stdin;
1	2026	1	82368.00	0.1300	0.1500	0.0450	0.0010	15	0.0800	0.1400	0.3500	0.1950	\N	2026-06-21 21:10:52.729361	0.0100
2	2026	2	82368.00	0.1300	0.1500	0.0450	0.0010	15	0.0800	0.1400	0.3500	0.1950	\N	2026-06-21 21:10:52.729361	0.0100
3	2026	3	82368.00	0.1300	0.1500	0.0450	0.0010	15	0.0800	0.1400	0.3500	0.1950	\N	2026-06-21 21:10:52.729361	0.0100
4	2026	4	82368.00	0.1300	0.1500	0.0450	0.0010	15	0.0800	0.1400	0.3500	0.1950	\N	2026-06-21 21:10:52.729361	0.0100
5	2026	5	82368.00	0.1300	0.1500	0.0450	0.0010	15	0.0800	0.1400	0.3500	0.1950	\N	2026-06-21 21:10:52.729361	0.0100
6	2026	6	82368.00	0.1300	0.1500	0.0450	0.0010	15	0.0800	0.1400	0.3500	0.1950	\N	2026-06-21 21:10:52.729361	0.0100
7	2026	7	82368.00	0.1300	0.1500	0.0450	0.0010	15	0.0800	0.1400	0.3500	0.1950	\N	2026-06-21 21:10:52.729361	0.0100
\.


--
-- Data for Name: periodos_liquidacion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.periodos_liquidacion (id, anio, mes, estado, snapshot_id, fecha_apertura, usuario_apertura, hash_snapshot, activo, fecha_cierre_insumos, usuario_cierre_insumos, fecha_calculo, usuario_calculo, fecha_cierre, usuario_cierre) FROM stdin;
\.


--
-- Data for Name: personas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.personas (id, cedula, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, email, telefono, direccion, codigo_postal, departamento, localidad, fecha_actualizacion) FROM stdin;
\.


--
-- Data for Name: programas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.programas (id, codigo, denominacion, vigente) FROM stdin;
1	300	Programa 300	t
2	460	Programa 460	t
\.


--
-- Data for Name: regimenes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.regimenes (id, numero_ley, denominacion, vigente, es_ley_vieja) FROM stdin;
1	14.157	Ley Vieja	t	t
2	19.695	Ley Nueva	t	f
\.


--
-- Data for Name: reglas_ascenso; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reglas_ascenso (id, grado_origen_id, grado_destino_id, dias_minimos, requisitos_adicionales, activo) FROM stdin;
1	1	2	365	Ascenso automático por 1 año en grado	t
2	2	3	730	Ascenso automático por 2 años en grado	t
3	3	4	1095	Ascenso automático por 3 años en grado	t
\.


--
-- Data for Name: relaciones_laborales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.relaciones_laborales (id, persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, fecha_fin, estado, prima_tecnica, prima_solidaria_familiar, riesgo_vuelo, anios_inactivos, observaciones, sub_unidad_id, motivo_baja_id, fecha_ultimo_ascenso, grado_reincorporacion_id, haber_retiro, porcentaje_progresivo, fecha_actualizacion, categoria_viatico, usa_fonasa, anios_servicio_anterior, fecha_ascenso_oficial, superprima) FROM stdin;
\.


--
-- Data for Name: remuneraciones_grado; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.remuneraciones_grado (id, grado_id, item_id, monto, tipo_monto, vigente_desde, vigente_hasta, creado_por, creado_en) FROM stdin;
1	1	1	6956.31	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
2	2	1	8347.57	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
3	3	1	10017.09	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
4	4	1	11964.86	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
5	5	1	14747.38	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
6	6	1	16695.15	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
7	7	1	13634.37	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
8	8	1	18642.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
9	9	1	20312.43	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
10	10	1	23651.46	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
11	11	1	25877.48	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
12	12	1	27825.25	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
13	13	1	30886.02	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
14	14	1	34781.56	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
15	15	1	34781.56	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
22	7	2	744.88	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
23	8	2	1018.51	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
24	9	2	1109.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
25	10	2	1292.14	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
26	11	2	2262.00	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
27	12	2	2432.26	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
28	13	2	3374.76	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
29	14	2	5700.61	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
30	15	2	11401.22	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
31	7	3	4176.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
32	8	3	11276.79	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
34	10	3	14322.99	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
35	11	3	18239.12	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
36	12	3	19615.76	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
37	13	3	28452.67	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
38	14	3	35291.97	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
39	15	3	40851.28	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
42	3	4	1089.21	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
43	4	4	1717.66	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
44	5	4	2749.38	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
45	6	4	4546.89	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
46	7	4	1722.16	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
47	8	4	1982.16	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
48	9	4	4003.95	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
49	10	4	4494.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
50	11	4	7148.18	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
51	12	4	8548.10	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
52	13	4	12811.99	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
53	14	4	18080.24	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
54	15	4	21151.74	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
55	1	25	1252.80	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
56	2	25	1331.09	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
57	3	25	1331.09	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
58	4	25	1409.42	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
59	5	25	1409.42	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
60	6	25	1409.42	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
61	7	25	1487.71	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
62	8	25	1487.71	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
63	9	25	1566.01	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
64	10	25	1566.01	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
65	11	25	1566.01	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
66	12	25	1566.01	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
67	13	25	1566.01	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
68	14	25	1566.01	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
69	15	25	1566.01	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
70	14	58	6554.93	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
71	15	58	12743.98	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
72	1	61	1256.60	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
73	2	61	1328.78	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
74	3	61	1328.78	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
75	4	61	1415.44	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
76	5	61	1415.44	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
77	6	61	1415.44	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
78	7	61	1487.74	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
79	8	61	1487.74	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
80	9	61	1559.92	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
81	10	61	1559.92	diario	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
88	1	5	605.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
89	2	5	669.68	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
90	3	5	841.90	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
91	4	5	924.78	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
92	5	5	1275.59	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
93	6	5	1498.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
94	7	5	1562.62	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
95	8	5	1817.69	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
97	10	5	2296.06	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
98	11	5	2614.94	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
99	12	5	2901.97	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
100	13	5	4624.01	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
101	14	5	5421.85	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
102	15	5	5421.85	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
103	1	9	320.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
104	2	9	384.41	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
105	3	9	461.29	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
106	4	9	550.99	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
107	5	9	679.12	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
108	6	9	768.82	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
109	7	9	627.87	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
110	8	9	858.51	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
111	9	9	935.40	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
112	10	9	1089.16	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
113	11	9	1191.67	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
114	12	9	1281.36	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
115	13	9	1422.31	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
116	14	9	1903.56	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
117	15	9	1903.56	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
118	1	11	3828.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
119	2	11	3890.29	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
120	3	11	4208.71	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
121	4	11	4377.48	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
122	5	11	4802.26	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
123	6	11	5128.56	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
124	7	11	3493.64	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
125	8	11	3043.28	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
126	9	11	3187.55	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
127	10	11	3331.82	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
128	11	11	1167.74	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
129	12	11	1167.74	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
130	1	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
131	2	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
132	3	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
133	4	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
134	5	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
135	6	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
136	7	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
137	8	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
138	9	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
139	10	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
140	11	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
141	12	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
142	13	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
143	14	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
144	15	14	190.02	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
145	25	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
146	26	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
147	27	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
148	28	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
149	29	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
150	30	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
151	31	14	114.01	por_unidad	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
152	1	6	7830.05	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
153	2	6	7830.05	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
154	3	6	7830.05	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
155	4	6	7830.05	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
156	5	6	7830.05	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
157	6	6	7830.05	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
158	7	6	7830.05	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
159	8	6	2192.41	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
161	10	6	2192.41	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
162	1	8	456.05	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
163	2	8	547.26	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
164	3	8	656.71	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
165	4	8	784.40	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
166	5	8	966.82	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
167	6	8	1094.52	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
168	7	8	893.86	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
169	8	8	1222.21	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
171	10	8	1550.57	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
172	11	8	1696.50	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
173	12	8	1824.20	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
174	13	8	2024.86	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
175	14	8	2280.24	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
176	15	8	2280.24	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
177	1	10	324.16	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
178	2	10	389.00	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
179	3	10	466.80	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
180	4	10	557.56	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
181	5	10	687.23	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
182	6	10	777.99	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
183	7	10	635.36	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
184	8	10	868.76	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
186	10	10	1102.16	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
187	11	10	1205.89	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
188	12	10	1296.66	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
189	13	10	1439.29	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
190	14	10	1926.28	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
191	15	10	2214.69	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
192	6	7	912.10	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
193	7	7	744.88	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
194	8	7	1018.51	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
196	10	7	1292.14	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
197	11	7	1413.75	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
198	12	7	912.10	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
199	13	7	1012.43	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
200	14	7	1140.12	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
201	15	7	1140.12	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
202	1	75	3203.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
203	2	75	2135.94	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
204	3	75	1708.75	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
205	7	75	3993.63	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
206	8	75	3073.94	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
208	10	75	3726.42	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
209	11	75	5444.66	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
210	12	75	5886.88	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
211	13	75	5118.44	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
212	14	75	5625.88	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
213	15	75	6420.67	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
214	11	76	610.89	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.049142
215	12	76	610.89	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.049142
219	1	63	1455.30	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.050004
220	2	63	1343.35	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.050004
221	3	63	1903.10	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.050004
222	4	63	1679.16	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.050004
223	5	63	1567.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.050004
224	6	63	1567.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.050004
225	1	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
226	2	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
227	3	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
228	4	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
229	5	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
230	6	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
231	7	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
232	8	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
234	10	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
235	11	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
236	12	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
237	13	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
238	14	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
239	15	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
240	16	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
241	17	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
242	18	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
243	19	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
244	20	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
245	21	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
246	22	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
247	23	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
248	24	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
249	25	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
250	26	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
251	27	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
252	28	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
253	29	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
254	30	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
255	31	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
256	1	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
257	2	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
258	3	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
259	4	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
260	5	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
261	6	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
262	7	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
263	8	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
265	10	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
266	11	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
267	12	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
268	13	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
269	14	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
270	15	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
271	16	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
272	17	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
273	18	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
274	19	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
275	20	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
276	21	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
277	22	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
278	23	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
279	24	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
280	25	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
281	26	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
282	27	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
283	28	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
284	29	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
285	30	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
286	31	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
287	7	17	11106.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
288	8	17	11106.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
290	10	17	11106.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
291	11	17	11106.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
292	12	17	11106.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
293	13	17	26766.74	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
294	14	17	26766.74	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
295	15	17	26766.74	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
300	5	15	3040.33	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.097115
301	6	15	3040.33	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.097115
302	1	16	912.10	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.097737
303	2	16	912.10	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.097737
304	3	16	912.10	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.097737
305	4	16	1520.16	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.097737
306	5	16	3040.33	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.097737
307	6	16	3040.33	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.097737
308	1	188	6314.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098317
309	2	188	5576.38	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098317
310	3	188	5576.38	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098317
311	4	188	5576.38	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098317
312	5	188	5576.38	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098317
313	6	188	5576.38	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098317
314	1	13	790.48	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098869
315	2	13	674.95	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098869
316	3	13	634.82	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098869
317	4	13	758.26	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098869
318	5	13	934.60	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098869
319	6	13	1058.03	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.098869
320	26	3	6481.96	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
321	26	5	223.23	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
322	26	9	128.14	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
323	26	11	522.50	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
324	26	75	4271.89	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
325	26	1	2782.52	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
326	26	8	182.42	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
327	26	10	129.67	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
328	30	7	136.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
329	30	3	6927.17	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
330	30	5	191.30	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
331	30	9	115.32	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
332	30	11	522.50	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
333	30	1	2504.27	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
334	30	8	164.18	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
335	30	10	116.70	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
336	27	7	136.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
337	27	3	11821.59	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
338	27	5	191.30	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
339	27	9	115.32	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
340	27	11	522.50	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
341	27	1	2504.27	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
342	27	8	164.18	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
343	27	10	116.70	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
344	31	7	136.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
345	31	3	11821.59	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
346	31	5	191.30	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
347	31	9	115.32	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
348	31	11	522.50	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
349	31	1	2504.27	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
350	31	8	164.18	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
351	31	10	116.70	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
352	28	7	136.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
353	28	3	16716.02	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
354	28	5	191.30	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
355	28	9	115.32	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
356	28	11	522.50	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
357	28	1	2504.27	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
358	28	8	164.18	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
359	28	10	116.70	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
360	29	7	136.81	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
361	29	3	19161.76	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
362	29	5	191.30	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
363	29	9	115.32	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
364	29	11	522.50	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
365	29	1	2504.27	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
366	29	8	164.18	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
367	29	10	116.70	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
369	25	5	478.33	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
370	25	9	230.65	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
371	25	1	5008.54	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
372	25	8	328.36	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
373	25	10	233.40	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.100072
374	1	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
375	2	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
376	3	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
377	4	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
378	5	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
379	6	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
380	7	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
381	8	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
382	9	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
383	10	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
384	11	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
385	12	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
386	13	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
387	14	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
388	15	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
389	16	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
390	17	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
391	18	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
392	19	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
393	20	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
394	21	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
395	22	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
396	23	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
397	24	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
398	25	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
399	26	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
400	27	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
401	28	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
402	29	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
403	30	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
404	31	19	974.16	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
405	1	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
406	2	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
407	3	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
408	4	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
409	5	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
410	6	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
411	7	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
412	8	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
413	9	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
414	10	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
415	11	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
416	12	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
417	13	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
418	14	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
419	15	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
420	16	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
421	17	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
422	18	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
423	19	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
424	20	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
425	21	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
426	22	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
427	23	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
428	24	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
429	25	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
430	26	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
431	27	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
432	28	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
433	29	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
434	30	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
435	31	20	294.63	diario	2026-01-01	\N	\N	2026-06-21 21:10:53.299678
436	1	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
437	2	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
438	3	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
439	4	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
440	5	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
441	6	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
442	7	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
443	8	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
444	9	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
445	10	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
446	11	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
447	12	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
448	13	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
449	14	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
450	15	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
451	16	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
452	17	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
453	18	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
454	19	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
455	20	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
456	21	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
457	22	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
458	23	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
459	24	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
460	25	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
461	26	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
462	27	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
463	28	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
464	29	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
465	30	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
466	31	24	6742.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.30235
467	1	27	6956.31	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
468	2	27	8347.57	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
469	3	27	10017.09	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
470	4	27	11964.86	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
471	5	27	14747.38	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
472	6	27	16695.15	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
473	7	27	13634.37	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
474	8	27	18642.91	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
475	9	27	20312.43	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
476	10	27	23651.46	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
477	11	27	25877.48	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
478	12	27	27825.25	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
479	13	27	30886.02	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
480	14	27	34781.56	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
481	15	27	34781.56	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
482	26	27	2782.52	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
483	30	27	2504.27	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
484	27	27	2504.27	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
485	31	27	2504.27	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
486	28	27	2504.27	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
487	29	27	2504.27	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
488	25	27	5008.54	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.84728
195	9	7	1109.72	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.047758
96	9	5	1594.46	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.975344
33	9	3	9610.17	mensual	2026-01-01	\N	\N	2026-06-21 21:10:52.729361
233	9	184	516.91	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.092474
264	9	185	722.49	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.09476
185	9	10	946.56	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046906
160	9	6	2192.41	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.043585
289	9	17	11106.34	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.095782
170	9	8	1331.66	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.046012
207	9	75	3305.87	mensual	2026-01-01	\N	\N	2026-06-21 21:10:53.048337
489	9	12	2710.15	mensual	2026-01-01	\N	\N	2026-06-22 02:36:56.968846
490	1	12	2839.21	mensual	2024-01-01	\N	\N	2026-06-22 02:36:56.968846
491	2	12	2839.21	mensual	2024-01-01	\N	\N	2026-06-22 02:36:56.968846
492	3	12	2774.68	mensual	2024-01-01	\N	\N	2026-06-22 02:36:56.968846
493	4	12	2710.15	mensual	2024-01-01	\N	\N	2026-06-22 02:36:56.968846
494	5	12	2710.15	mensual	2024-01-01	\N	\N	2026-06-22 02:36:56.968846
495	7	12	2710.15	mensual	2024-01-01	\N	\N	2026-06-22 02:36:56.968846
496	8	12	2710.15	mensual	2024-01-01	\N	\N	2026-06-22 02:36:56.968846
497	10	12	2710.15	mensual	2024-01-01	\N	\N	2026-06-22 02:36:56.968846
\.


--
-- Data for Name: retroactividad_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.retroactividad_items (id, retroactividad_id, codigo_item, monto_anterior, monto_nuevo, diferencia, monto_total_retro, es_descuento) FROM stdin;
\.


--
-- Data for Name: retroactividades; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.retroactividades (id, periodo_id, persona_id, periodo_referencia_id, tipo, meses_retro, estado, creado_por, creado_en, confirmado_por, confirmado_en, calculado_en) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (id, nombre, descripcion) FROM stdin;
1	Administrador	Acceso completo al sistema de liquidación
2	Usuario	Usuario básico del sistema
3	Supervisor	Supervisor de liquidaciones
\.



--
-- Data for Name: situaciones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.situaciones (id, codigo, denominacion, descripcion, vigente, calculador, afecta_cobro, sistema_salud) FROM stdin;
1	SIT01	Personal Superior en actividad.	\N	t	Sit10Calculator	t	ssffaa
2	SIT02	Personal Superior en disponibilidad.	\N	t	Sit20Calculator	t	ssffaa
3	SIT03	Licencia sin goce de sueldo.	\N	t	SinCalculador	f	ssffaa
4	SIT04	Personal Superior no disponible.	\N	t	SinCalculador	f	ssffaa
6	SIT06	Personal Superior sueldo retenido.	\N	t	SinCalculador	f	ssffaa
7	SIT07	Personal Subalterno en actividad.	\N	t	Sit30Calculator	t	ssffaa
8	SIT08	Reservistas tropa.	\N	t	ReservaCalculator	t	ssffaa
9	SIT09	Personal Subalterno con licencia s/goce de sueldo.	\N	t	SinCalculador	f	ssffaa
10	SIT10	Reserva de cargo.	\N	t	SinCalculador	f	ssffaa
11	SIT11	Personal Subalterno sueldo retenido.	\N	t	SinCalculador	f	ssffaa
12	SIT12	Aspirantes y cadetes.	\N	t	Sit40Calculator	t	ssffaa
13	SIT13	Aprendiz.	\N	t	Sit40Calculator	t	ssffaa
14	SIT14	Baja del mes Señores Oficiales (para aguinaldo).	\N	t	AguinaldoCalculator	t	ssffaa
15	SIT15	Baja del mes Personal Subalterno (para aguinaldo).	\N	t	AguinaldoCalculator	t	ssffaa
16	SIT16	Personal Superior reincorporado.	\N	t	Sit50Calculator	t	ssffaa
17	SIT17	Personal Subalterno reincorporado.	\N	t	Sit50Calculator	t	ssffaa
18	SIT18	Aguinaldo baja reincorporado.	\N	t	AguinaldoCalculator	t	ssffaa
19	SIT19	Civil presupuestado sin equiparar.	\N	t	CivilCalculator	t	ssffaa
20	SIT20	Baja del mes civil presupuestado sin equiparar.	\N	t	AguinaldoCalculator	t	ssffaa
21	SIT21	Civil contratado sin equiparar.	\N	t	CivilCalculator	t	ssffaa
22	SIT22	Subsidio transitorio.	\N	t	SubsidioCalculator	t	ssffaa
5	SIT05	Personal Superior reservistas.	\N	t	ReservaSuperiorCalculator	t	ssffaa
\.


--
-- Data for Name: snapshots_insumos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.snapshots_insumos (id, fecha_creacion, contenido_json, hash_integridad) FROM stdin;
\.


--
-- Data for Name: sub_unidades; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sub_unidades (id, unidad_id, codigo, denominacion, vigente) FROM stdin;
1	1	BAI	B.A.I.	t
2	1	BAII	B.A.II.	t
3	1	BAIII	B.A.III.	t
4	1	SMETEO	S.METEO.	t
5	1	SSRRAA	S.S.RR.AA.	t
6	1	COA	C.O.A.	t
7	2	ETA	E.T.A.	t
8	2	EMA	E.M.A.	t
9	2	ECEMA	E.C.E.M.A.	t
10	2	CIAA	CÍA "A".	t
11	2	CIAB	CÍA "B".	t
12	2	SSFA	S.S.F.A.	t
13	3	SABAST	S.ABAST.	t
14	3	SMANT	S. MANT.	t
15	3	SINFRA	S.INFRA.	t
16	3	SCOM	S.COM.	t
17	4	DCG	D.C.G.	t
18	4	BANDA	BANDA	t
\.


--
-- Data for Name: tabla_hogar_constituido; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tabla_hogar_constituido (id, hasta_haberes, importe, ref_porcentaje, vigente_desde) FROM stdin;
1	6864.00	2745.60	40%	2026-01-01
2	8923.20	2608.32	38%	2026-01-01
3	10982.40	2471.04	36%	2026-01-01
4	12355.20	2196.48	32%	2026-01-01
5	15100.80	1921.92	28%	2026-01-01
6	\N	1647.36	24%	2026-01-01
\.


--
-- Data for Name: tabla_permanencia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tabla_permanencia (id, escalafon_id, grado_id, meses_desde, meses_hasta, monto_fijo, porcentaje, aplica_riesgo_vuelo, vigente_desde, vigente_hasta, activo) FROM stdin;
1	1	1	0	12	760.08	\N	f	2026-01-01	\N	t
2	1	1	0	24	1520.16	\N	f	2026-01-01	\N	t
3	2	1	0	12	760.08	\N	f	2026-01-01	\N	t
4	2	1	0	24	1520.16	\N	f	2026-01-01	\N	t
5	3	1	0	12	760.08	\N	f	2026-01-01	\N	t
6	3	1	0	24	1520.16	\N	f	2026-01-01	\N	t
7	4	1	0	12	760.08	\N	f	2026-01-01	\N	t
8	4	1	0	24	1520.16	\N	f	2026-01-01	\N	t
9	5	1	0	12	760.08	\N	f	2026-01-01	\N	t
10	5	1	0	24	1520.16	\N	f	2026-01-01	\N	t
11	6	1	0	12	760.08	\N	f	2026-01-01	\N	t
12	6	1	0	24	1520.16	\N	f	2026-01-01	\N	t
13	7	1	0	12	760.08	\N	f	2026-01-01	\N	t
14	7	1	0	24	1520.16	\N	f	2026-01-01	\N	t
15	8	1	0	12	760.08	\N	f	2026-01-01	\N	t
16	8	1	0	24	1520.16	\N	f	2026-01-01	\N	t
17	9	1	0	12	760.08	\N	f	2026-01-01	\N	t
18	9	1	0	24	1520.16	\N	f	2026-01-01	\N	t
19	10	1	0	12	760.08	\N	f	2026-01-01	\N	t
20	10	1	0	24	1520.16	\N	f	2026-01-01	\N	t
21	11	1	0	12	760.08	\N	f	2026-01-01	\N	t
22	11	1	0	24	1520.16	\N	f	2026-01-01	\N	t
23	12	1	0	12	760.08	\N	f	2026-01-01	\N	t
24	12	1	0	24	1520.16	\N	f	2026-01-01	\N	t
25	13	1	0	12	760.08	\N	f	2026-01-01	\N	t
26	13	1	0	24	1520.16	\N	f	2026-01-01	\N	t
27	14	1	0	12	760.08	\N	f	2026-01-01	\N	t
28	14	1	0	24	1520.16	\N	f	2026-01-01	\N	t
29	15	1	0	12	760.08	\N	f	2026-01-01	\N	t
30	15	1	0	24	1520.16	\N	f	2026-01-01	\N	t
31	16	1	0	12	760.08	\N	f	2026-01-01	\N	t
32	16	1	0	24	1520.16	\N	f	2026-01-01	\N	t
33	17	1	0	12	760.08	\N	f	2026-01-01	\N	t
34	17	1	0	24	1520.16	\N	f	2026-01-01	\N	t
35	1	1	0	12	760.08	\N	t	2026-01-01	\N	t
36	1	1	0	24	1520.16	\N	t	2026-01-01	\N	t
37	2	1	0	12	760.08	\N	t	2026-01-01	\N	t
38	2	1	0	24	1520.16	\N	t	2026-01-01	\N	t
39	3	1	0	12	760.08	\N	t	2026-01-01	\N	t
40	3	1	0	24	1520.16	\N	t	2026-01-01	\N	t
41	4	1	0	12	760.08	\N	t	2026-01-01	\N	t
42	4	1	0	24	1520.16	\N	t	2026-01-01	\N	t
43	5	1	0	12	760.08	\N	t	2026-01-01	\N	t
44	5	1	0	24	1520.16	\N	t	2026-01-01	\N	t
45	6	1	0	12	760.08	\N	t	2026-01-01	\N	t
46	6	1	0	24	1520.16	\N	t	2026-01-01	\N	t
47	7	1	0	12	760.08	\N	t	2026-01-01	\N	t
48	7	1	0	24	1520.16	\N	t	2026-01-01	\N	t
49	8	1	0	12	760.08	\N	t	2026-01-01	\N	t
50	8	1	0	24	1520.16	\N	t	2026-01-01	\N	t
51	9	1	0	12	760.08	\N	t	2026-01-01	\N	t
52	9	1	0	24	1520.16	\N	t	2026-01-01	\N	t
53	10	1	0	12	760.08	\N	t	2026-01-01	\N	t
54	10	1	0	24	1520.16	\N	t	2026-01-01	\N	t
55	11	1	0	12	760.08	\N	t	2026-01-01	\N	t
56	11	1	0	24	1520.16	\N	t	2026-01-01	\N	t
57	12	1	0	12	760.08	\N	t	2026-01-01	\N	t
58	12	1	0	24	1520.16	\N	t	2026-01-01	\N	t
59	13	1	0	12	760.08	\N	t	2026-01-01	\N	t
60	13	1	0	24	1520.16	\N	t	2026-01-01	\N	t
61	14	1	0	12	760.08	\N	t	2026-01-01	\N	t
62	14	1	0	24	1520.16	\N	t	2026-01-01	\N	t
63	15	1	0	12	760.08	\N	t	2026-01-01	\N	t
64	15	1	0	24	1520.16	\N	t	2026-01-01	\N	t
65	16	1	0	12	760.08	\N	t	2026-01-01	\N	t
66	16	1	0	24	1520.16	\N	t	2026-01-01	\N	t
67	17	1	0	12	760.08	\N	t	2026-01-01	\N	t
68	17	1	0	24	1520.16	\N	t	2026-01-01	\N	t
69	1	2	0	12	957.70	\N	f	2026-01-01	\N	t
70	1	2	0	24	1915.41	\N	f	2026-01-01	\N	t
71	2	2	0	12	957.70	\N	f	2026-01-01	\N	t
72	2	2	0	24	1915.41	\N	f	2026-01-01	\N	t
73	3	2	0	12	957.70	\N	f	2026-01-01	\N	t
74	3	2	0	24	1915.41	\N	f	2026-01-01	\N	t
75	4	2	0	12	957.70	\N	f	2026-01-01	\N	t
76	4	2	0	24	1915.41	\N	f	2026-01-01	\N	t
77	5	2	0	12	957.70	\N	f	2026-01-01	\N	t
78	5	2	0	24	1915.41	\N	f	2026-01-01	\N	t
79	6	2	0	12	957.70	\N	f	2026-01-01	\N	t
80	6	2	0	24	1915.41	\N	f	2026-01-01	\N	t
81	7	2	0	12	957.70	\N	f	2026-01-01	\N	t
82	7	2	0	24	1915.41	\N	f	2026-01-01	\N	t
83	8	2	0	12	957.70	\N	f	2026-01-01	\N	t
84	8	2	0	24	1915.41	\N	f	2026-01-01	\N	t
85	9	2	0	12	957.70	\N	f	2026-01-01	\N	t
86	9	2	0	24	1915.41	\N	f	2026-01-01	\N	t
87	10	2	0	12	957.70	\N	f	2026-01-01	\N	t
88	10	2	0	24	1915.41	\N	f	2026-01-01	\N	t
89	11	2	0	12	957.70	\N	f	2026-01-01	\N	t
90	11	2	0	24	1915.41	\N	f	2026-01-01	\N	t
91	12	2	0	12	957.70	\N	f	2026-01-01	\N	t
92	12	2	0	24	1915.41	\N	f	2026-01-01	\N	t
93	13	2	0	12	957.70	\N	f	2026-01-01	\N	t
94	13	2	0	24	1915.41	\N	f	2026-01-01	\N	t
95	14	2	0	12	957.70	\N	f	2026-01-01	\N	t
96	14	2	0	24	1915.41	\N	f	2026-01-01	\N	t
97	15	2	0	12	957.70	\N	f	2026-01-01	\N	t
98	15	2	0	24	1915.41	\N	f	2026-01-01	\N	t
99	16	2	0	12	957.70	\N	f	2026-01-01	\N	t
100	16	2	0	24	1915.41	\N	f	2026-01-01	\N	t
101	17	2	0	12	957.70	\N	f	2026-01-01	\N	t
102	17	2	0	24	1915.41	\N	f	2026-01-01	\N	t
103	1	2	0	12	957.70	\N	t	2026-01-01	\N	t
104	1	2	0	24	1915.41	\N	t	2026-01-01	\N	t
105	2	2	0	12	957.70	\N	t	2026-01-01	\N	t
106	2	2	0	24	1915.41	\N	t	2026-01-01	\N	t
107	3	2	0	12	957.70	\N	t	2026-01-01	\N	t
108	3	2	0	24	1915.41	\N	t	2026-01-01	\N	t
109	4	2	0	12	957.70	\N	t	2026-01-01	\N	t
110	4	2	0	24	1915.41	\N	t	2026-01-01	\N	t
111	5	2	0	12	957.70	\N	t	2026-01-01	\N	t
112	5	2	0	24	1915.41	\N	t	2026-01-01	\N	t
113	6	2	0	12	957.70	\N	t	2026-01-01	\N	t
114	6	2	0	24	1915.41	\N	t	2026-01-01	\N	t
115	7	2	0	12	957.70	\N	t	2026-01-01	\N	t
116	7	2	0	24	1915.41	\N	t	2026-01-01	\N	t
117	8	2	0	12	957.70	\N	t	2026-01-01	\N	t
118	8	2	0	24	1915.41	\N	t	2026-01-01	\N	t
119	9	2	0	12	957.70	\N	t	2026-01-01	\N	t
120	9	2	0	24	1915.41	\N	t	2026-01-01	\N	t
121	10	2	0	12	957.70	\N	t	2026-01-01	\N	t
122	10	2	0	24	1915.41	\N	t	2026-01-01	\N	t
123	11	2	0	12	957.70	\N	t	2026-01-01	\N	t
124	11	2	0	24	1915.41	\N	t	2026-01-01	\N	t
125	12	2	0	12	957.70	\N	t	2026-01-01	\N	t
126	12	2	0	24	1915.41	\N	t	2026-01-01	\N	t
127	13	2	0	12	957.70	\N	t	2026-01-01	\N	t
128	13	2	0	24	1915.41	\N	t	2026-01-01	\N	t
129	14	2	0	12	957.70	\N	t	2026-01-01	\N	t
130	14	2	0	24	1915.41	\N	t	2026-01-01	\N	t
131	15	2	0	12	957.70	\N	t	2026-01-01	\N	t
132	15	2	0	24	1915.41	\N	t	2026-01-01	\N	t
133	16	2	0	12	957.70	\N	t	2026-01-01	\N	t
134	16	2	0	24	1915.41	\N	t	2026-01-01	\N	t
135	17	2	0	12	957.70	\N	t	2026-01-01	\N	t
136	17	2	0	24	1915.41	\N	t	2026-01-01	\N	t
137	1	3	0	12	1117.32	\N	f	2026-01-01	\N	t
138	1	3	0	24	2234.64	\N	f	2026-01-01	\N	t
139	2	3	0	12	1117.32	\N	f	2026-01-01	\N	t
140	2	3	0	24	2234.64	\N	f	2026-01-01	\N	t
141	3	3	0	12	1117.32	\N	f	2026-01-01	\N	t
142	3	3	0	24	2234.64	\N	f	2026-01-01	\N	t
143	4	3	0	12	1117.32	\N	f	2026-01-01	\N	t
144	4	3	0	24	2234.64	\N	f	2026-01-01	\N	t
145	5	3	0	12	1117.32	\N	f	2026-01-01	\N	t
146	5	3	0	24	2234.64	\N	f	2026-01-01	\N	t
147	6	3	0	12	1117.32	\N	f	2026-01-01	\N	t
148	6	3	0	24	2234.64	\N	f	2026-01-01	\N	t
149	7	3	0	12	1117.32	\N	f	2026-01-01	\N	t
150	7	3	0	24	2234.64	\N	f	2026-01-01	\N	t
151	8	3	0	12	1117.32	\N	f	2026-01-01	\N	t
152	8	3	0	24	2234.64	\N	f	2026-01-01	\N	t
153	9	3	0	12	1117.32	\N	f	2026-01-01	\N	t
154	9	3	0	24	2234.64	\N	f	2026-01-01	\N	t
155	10	3	0	12	1117.32	\N	f	2026-01-01	\N	t
156	10	3	0	24	2234.64	\N	f	2026-01-01	\N	t
157	11	3	0	12	1117.32	\N	f	2026-01-01	\N	t
158	11	3	0	24	2234.64	\N	f	2026-01-01	\N	t
159	12	3	0	12	1117.32	\N	f	2026-01-01	\N	t
160	12	3	0	24	2234.64	\N	f	2026-01-01	\N	t
161	13	3	0	12	1117.32	\N	f	2026-01-01	\N	t
162	13	3	0	24	2234.64	\N	f	2026-01-01	\N	t
163	14	3	0	12	1117.32	\N	f	2026-01-01	\N	t
164	14	3	0	24	2234.64	\N	f	2026-01-01	\N	t
165	15	3	0	12	1117.32	\N	f	2026-01-01	\N	t
166	15	3	0	24	2234.64	\N	f	2026-01-01	\N	t
167	16	3	0	12	1117.32	\N	f	2026-01-01	\N	t
168	16	3	0	24	2234.64	\N	f	2026-01-01	\N	t
169	17	3	0	12	1117.32	\N	f	2026-01-01	\N	t
170	17	3	0	24	2234.64	\N	f	2026-01-01	\N	t
171	1	3	0	12	1117.32	\N	t	2026-01-01	\N	t
172	1	3	0	24	2234.64	\N	t	2026-01-01	\N	t
173	2	3	0	12	1117.32	\N	t	2026-01-01	\N	t
174	2	3	0	24	2234.64	\N	t	2026-01-01	\N	t
175	3	3	0	12	1117.32	\N	t	2026-01-01	\N	t
176	3	3	0	24	2234.64	\N	t	2026-01-01	\N	t
177	4	3	0	12	1117.32	\N	t	2026-01-01	\N	t
178	4	3	0	24	2234.64	\N	t	2026-01-01	\N	t
179	5	3	0	12	1117.32	\N	t	2026-01-01	\N	t
180	5	3	0	24	2234.64	\N	t	2026-01-01	\N	t
181	6	3	0	12	1117.32	\N	t	2026-01-01	\N	t
182	6	3	0	24	2234.64	\N	t	2026-01-01	\N	t
183	7	3	0	12	1117.32	\N	t	2026-01-01	\N	t
184	7	3	0	24	2234.64	\N	t	2026-01-01	\N	t
185	8	3	0	12	1117.32	\N	t	2026-01-01	\N	t
186	8	3	0	24	2234.64	\N	t	2026-01-01	\N	t
187	9	3	0	12	1117.32	\N	t	2026-01-01	\N	t
188	9	3	0	24	2234.64	\N	t	2026-01-01	\N	t
189	10	3	0	12	1117.32	\N	t	2026-01-01	\N	t
190	10	3	0	24	2234.64	\N	t	2026-01-01	\N	t
191	11	3	0	12	1117.32	\N	t	2026-01-01	\N	t
192	11	3	0	24	2234.64	\N	t	2026-01-01	\N	t
193	12	3	0	12	1117.32	\N	t	2026-01-01	\N	t
194	12	3	0	24	2234.64	\N	t	2026-01-01	\N	t
195	13	3	0	12	1117.32	\N	t	2026-01-01	\N	t
196	13	3	0	24	2234.64	\N	t	2026-01-01	\N	t
197	14	3	0	12	1117.32	\N	t	2026-01-01	\N	t
198	14	3	0	24	2234.64	\N	t	2026-01-01	\N	t
199	15	3	0	12	1117.32	\N	t	2026-01-01	\N	t
200	15	3	0	24	2234.64	\N	t	2026-01-01	\N	t
201	16	3	0	12	1117.32	\N	t	2026-01-01	\N	t
202	16	3	0	24	2234.64	\N	t	2026-01-01	\N	t
203	17	3	0	12	1117.32	\N	t	2026-01-01	\N	t
204	17	3	0	24	2234.64	\N	t	2026-01-01	\N	t
205	1	4	0	12	1064.11	\N	f	2026-01-01	\N	t
206	1	4	0	24	2128.23	\N	f	2026-01-01	\N	t
207	1	4	0	36	3192.34	\N	f	2026-01-01	\N	t
208	2	4	0	12	1064.11	\N	f	2026-01-01	\N	t
209	2	4	0	24	2128.23	\N	f	2026-01-01	\N	t
210	2	4	0	36	3192.34	\N	f	2026-01-01	\N	t
211	3	4	0	12	1064.11	\N	f	2026-01-01	\N	t
212	3	4	0	24	2128.23	\N	f	2026-01-01	\N	t
213	3	4	0	36	3192.34	\N	f	2026-01-01	\N	t
214	4	4	0	12	1064.11	\N	f	2026-01-01	\N	t
215	4	4	0	24	2128.23	\N	f	2026-01-01	\N	t
216	4	4	0	36	3192.34	\N	f	2026-01-01	\N	t
217	5	4	0	12	1064.11	\N	f	2026-01-01	\N	t
218	5	4	0	24	2128.23	\N	f	2026-01-01	\N	t
219	5	4	0	36	3192.34	\N	f	2026-01-01	\N	t
220	6	4	0	12	1064.11	\N	f	2026-01-01	\N	t
221	6	4	0	24	2128.23	\N	f	2026-01-01	\N	t
222	6	4	0	36	3192.34	\N	f	2026-01-01	\N	t
223	7	4	0	12	1064.11	\N	f	2026-01-01	\N	t
224	7	4	0	24	2128.23	\N	f	2026-01-01	\N	t
225	7	4	0	36	3192.34	\N	f	2026-01-01	\N	t
226	8	4	0	12	1064.11	\N	f	2026-01-01	\N	t
227	8	4	0	24	2128.23	\N	f	2026-01-01	\N	t
228	8	4	0	36	3192.34	\N	f	2026-01-01	\N	t
229	9	4	0	12	1064.11	\N	f	2026-01-01	\N	t
230	9	4	0	24	2128.23	\N	f	2026-01-01	\N	t
231	9	4	0	36	3192.34	\N	f	2026-01-01	\N	t
232	10	4	0	12	1064.11	\N	f	2026-01-01	\N	t
233	10	4	0	24	2128.23	\N	f	2026-01-01	\N	t
234	10	4	0	36	3192.34	\N	f	2026-01-01	\N	t
235	11	4	0	12	1064.11	\N	f	2026-01-01	\N	t
236	11	4	0	24	2128.23	\N	f	2026-01-01	\N	t
237	11	4	0	36	3192.34	\N	f	2026-01-01	\N	t
238	12	4	0	12	1064.11	\N	f	2026-01-01	\N	t
239	12	4	0	24	2128.23	\N	f	2026-01-01	\N	t
240	12	4	0	36	3192.34	\N	f	2026-01-01	\N	t
241	13	4	0	12	1064.11	\N	f	2026-01-01	\N	t
242	13	4	0	24	2128.23	\N	f	2026-01-01	\N	t
243	13	4	0	36	3192.34	\N	f	2026-01-01	\N	t
244	14	4	0	12	1064.11	\N	f	2026-01-01	\N	t
245	14	4	0	24	2128.23	\N	f	2026-01-01	\N	t
246	14	4	0	36	3192.34	\N	f	2026-01-01	\N	t
247	15	4	0	12	1064.11	\N	f	2026-01-01	\N	t
248	15	4	0	24	2128.23	\N	f	2026-01-01	\N	t
249	15	4	0	36	3192.34	\N	f	2026-01-01	\N	t
250	16	4	0	12	1064.11	\N	f	2026-01-01	\N	t
251	16	4	0	24	2128.23	\N	f	2026-01-01	\N	t
252	16	4	0	36	3192.34	\N	f	2026-01-01	\N	t
253	17	4	0	12	1064.11	\N	f	2026-01-01	\N	t
254	17	4	0	24	2128.23	\N	f	2026-01-01	\N	t
255	17	4	0	36	3192.34	\N	f	2026-01-01	\N	t
256	1	4	0	12	1064.11	\N	t	2026-01-01	\N	t
257	1	4	0	24	2128.23	\N	t	2026-01-01	\N	t
258	1	4	0	36	3192.34	\N	t	2026-01-01	\N	t
259	2	4	0	12	1064.11	\N	t	2026-01-01	\N	t
260	2	4	0	24	2128.23	\N	t	2026-01-01	\N	t
261	2	4	0	36	3192.34	\N	t	2026-01-01	\N	t
262	3	4	0	12	1064.11	\N	t	2026-01-01	\N	t
263	3	4	0	24	2128.23	\N	t	2026-01-01	\N	t
264	3	4	0	36	3192.34	\N	t	2026-01-01	\N	t
265	4	4	0	12	1064.11	\N	t	2026-01-01	\N	t
266	4	4	0	24	2128.23	\N	t	2026-01-01	\N	t
267	4	4	0	36	3192.34	\N	t	2026-01-01	\N	t
268	5	4	0	12	1064.11	\N	t	2026-01-01	\N	t
269	5	4	0	24	2128.23	\N	t	2026-01-01	\N	t
270	5	4	0	36	3192.34	\N	t	2026-01-01	\N	t
271	6	4	0	12	1064.11	\N	t	2026-01-01	\N	t
272	6	4	0	24	2128.23	\N	t	2026-01-01	\N	t
273	6	4	0	36	3192.34	\N	t	2026-01-01	\N	t
274	7	4	0	12	1064.11	\N	t	2026-01-01	\N	t
275	7	4	0	24	2128.23	\N	t	2026-01-01	\N	t
276	7	4	0	36	3192.34	\N	t	2026-01-01	\N	t
277	8	4	0	12	1064.11	\N	t	2026-01-01	\N	t
278	8	4	0	24	2128.23	\N	t	2026-01-01	\N	t
279	8	4	0	36	3192.34	\N	t	2026-01-01	\N	t
280	9	4	0	12	1064.11	\N	t	2026-01-01	\N	t
281	9	4	0	24	2128.23	\N	t	2026-01-01	\N	t
282	9	4	0	36	3192.34	\N	t	2026-01-01	\N	t
283	10	4	0	12	1064.11	\N	t	2026-01-01	\N	t
284	10	4	0	24	2128.23	\N	t	2026-01-01	\N	t
285	10	4	0	36	3192.34	\N	t	2026-01-01	\N	t
286	11	4	0	12	1064.11	\N	t	2026-01-01	\N	t
287	11	4	0	24	2128.23	\N	t	2026-01-01	\N	t
288	11	4	0	36	3192.34	\N	t	2026-01-01	\N	t
289	12	4	0	12	1064.11	\N	t	2026-01-01	\N	t
290	12	4	0	24	2128.23	\N	t	2026-01-01	\N	t
291	12	4	0	36	3192.34	\N	t	2026-01-01	\N	t
292	13	4	0	12	1064.11	\N	t	2026-01-01	\N	t
293	13	4	0	24	2128.23	\N	t	2026-01-01	\N	t
294	13	4	0	36	3192.34	\N	t	2026-01-01	\N	t
295	14	4	0	12	1064.11	\N	t	2026-01-01	\N	t
296	14	4	0	24	2128.23	\N	t	2026-01-01	\N	t
297	14	4	0	36	3192.34	\N	t	2026-01-01	\N	t
298	15	4	0	12	1064.11	\N	t	2026-01-01	\N	t
299	15	4	0	24	2128.23	\N	t	2026-01-01	\N	t
300	15	4	0	36	3192.34	\N	t	2026-01-01	\N	t
301	16	4	0	12	1064.11	\N	t	2026-01-01	\N	t
302	16	4	0	24	2128.23	\N	t	2026-01-01	\N	t
303	16	4	0	36	3192.34	\N	t	2026-01-01	\N	t
304	17	4	0	12	1064.11	\N	t	2026-01-01	\N	t
305	17	4	0	24	2128.23	\N	t	2026-01-01	\N	t
306	17	4	0	36	3192.34	\N	t	2026-01-01	\N	t
307	1	5	0	12	558.66	\N	f	2026-01-01	\N	t
308	1	5	0	24	1117.32	\N	f	2026-01-01	\N	t
309	1	5	0	36	1675.98	\N	f	2026-01-01	\N	t
310	1	5	0	48	2234.64	\N	f	2026-01-01	\N	t
311	2	5	0	12	558.66	\N	f	2026-01-01	\N	t
312	2	5	0	24	1117.32	\N	f	2026-01-01	\N	t
313	2	5	0	36	1675.98	\N	f	2026-01-01	\N	t
314	2	5	0	48	2234.64	\N	f	2026-01-01	\N	t
315	3	5	0	12	558.66	\N	f	2026-01-01	\N	t
316	3	5	0	24	1117.32	\N	f	2026-01-01	\N	t
317	3	5	0	36	1675.98	\N	f	2026-01-01	\N	t
318	3	5	0	48	2234.64	\N	f	2026-01-01	\N	t
319	4	5	0	12	558.66	\N	f	2026-01-01	\N	t
320	4	5	0	24	1117.32	\N	f	2026-01-01	\N	t
321	4	5	0	36	1675.98	\N	f	2026-01-01	\N	t
322	4	5	0	48	2234.64	\N	f	2026-01-01	\N	t
323	5	5	0	12	558.66	\N	f	2026-01-01	\N	t
324	5	5	0	24	1117.32	\N	f	2026-01-01	\N	t
325	5	5	0	36	1675.98	\N	f	2026-01-01	\N	t
326	5	5	0	48	2234.64	\N	f	2026-01-01	\N	t
327	6	5	0	12	558.66	\N	f	2026-01-01	\N	t
328	6	5	0	24	1117.32	\N	f	2026-01-01	\N	t
329	6	5	0	36	1675.98	\N	f	2026-01-01	\N	t
330	6	5	0	48	2234.64	\N	f	2026-01-01	\N	t
331	7	5	0	12	558.66	\N	f	2026-01-01	\N	t
332	7	5	0	24	1117.32	\N	f	2026-01-01	\N	t
333	7	5	0	36	1675.98	\N	f	2026-01-01	\N	t
334	7	5	0	48	2234.64	\N	f	2026-01-01	\N	t
335	8	5	0	12	558.66	\N	f	2026-01-01	\N	t
336	8	5	0	24	1117.32	\N	f	2026-01-01	\N	t
337	8	5	0	36	1675.98	\N	f	2026-01-01	\N	t
338	8	5	0	48	2234.64	\N	f	2026-01-01	\N	t
339	9	5	0	12	558.66	\N	f	2026-01-01	\N	t
340	9	5	0	24	1117.32	\N	f	2026-01-01	\N	t
341	9	5	0	36	1675.98	\N	f	2026-01-01	\N	t
342	9	5	0	48	2234.64	\N	f	2026-01-01	\N	t
343	10	5	0	12	558.66	\N	f	2026-01-01	\N	t
344	10	5	0	24	1117.32	\N	f	2026-01-01	\N	t
345	10	5	0	36	1675.98	\N	f	2026-01-01	\N	t
346	10	5	0	48	2234.64	\N	f	2026-01-01	\N	t
347	11	5	0	12	558.66	\N	f	2026-01-01	\N	t
348	11	5	0	24	1117.32	\N	f	2026-01-01	\N	t
349	11	5	0	36	1675.98	\N	f	2026-01-01	\N	t
350	11	5	0	48	2234.64	\N	f	2026-01-01	\N	t
351	12	5	0	12	558.66	\N	f	2026-01-01	\N	t
352	12	5	0	24	1117.32	\N	f	2026-01-01	\N	t
353	12	5	0	36	1675.98	\N	f	2026-01-01	\N	t
354	12	5	0	48	2234.64	\N	f	2026-01-01	\N	t
355	13	5	0	12	558.66	\N	f	2026-01-01	\N	t
356	13	5	0	24	1117.32	\N	f	2026-01-01	\N	t
357	13	5	0	36	1675.98	\N	f	2026-01-01	\N	t
358	13	5	0	48	2234.64	\N	f	2026-01-01	\N	t
359	14	5	0	12	558.66	\N	f	2026-01-01	\N	t
360	14	5	0	24	1117.32	\N	f	2026-01-01	\N	t
361	14	5	0	36	1675.98	\N	f	2026-01-01	\N	t
362	14	5	0	48	2234.64	\N	f	2026-01-01	\N	t
363	15	5	0	12	558.66	\N	f	2026-01-01	\N	t
364	15	5	0	24	1117.32	\N	f	2026-01-01	\N	t
365	15	5	0	36	1675.98	\N	f	2026-01-01	\N	t
366	15	5	0	48	2234.64	\N	f	2026-01-01	\N	t
367	16	5	0	12	558.66	\N	f	2026-01-01	\N	t
368	16	5	0	24	1117.32	\N	f	2026-01-01	\N	t
369	16	5	0	36	1675.98	\N	f	2026-01-01	\N	t
370	16	5	0	48	2234.64	\N	f	2026-01-01	\N	t
371	17	5	0	12	558.66	\N	f	2026-01-01	\N	t
372	17	5	0	24	1117.32	\N	f	2026-01-01	\N	t
373	17	5	0	36	1675.98	\N	f	2026-01-01	\N	t
374	17	5	0	48	2234.64	\N	f	2026-01-01	\N	t
375	1	5	0	12	744.88	\N	t	2026-01-01	\N	t
376	1	5	0	24	1489.76	\N	t	2026-01-01	\N	t
377	1	5	0	36	2234.64	\N	t	2026-01-01	\N	t
378	2	5	0	12	744.88	\N	t	2026-01-01	\N	t
379	2	5	0	24	1489.76	\N	t	2026-01-01	\N	t
380	2	5	0	36	2234.64	\N	t	2026-01-01	\N	t
381	3	5	0	12	744.88	\N	t	2026-01-01	\N	t
382	3	5	0	24	1489.76	\N	t	2026-01-01	\N	t
383	3	5	0	36	2234.64	\N	t	2026-01-01	\N	t
384	4	5	0	12	744.88	\N	t	2026-01-01	\N	t
385	4	5	0	24	1489.76	\N	t	2026-01-01	\N	t
386	4	5	0	36	2234.64	\N	t	2026-01-01	\N	t
387	5	5	0	12	744.88	\N	t	2026-01-01	\N	t
388	5	5	0	24	1489.76	\N	t	2026-01-01	\N	t
389	5	5	0	36	2234.64	\N	t	2026-01-01	\N	t
390	6	5	0	12	744.88	\N	t	2026-01-01	\N	t
391	6	5	0	24	1489.76	\N	t	2026-01-01	\N	t
392	6	5	0	36	2234.64	\N	t	2026-01-01	\N	t
393	7	5	0	12	744.88	\N	t	2026-01-01	\N	t
394	7	5	0	24	1489.76	\N	t	2026-01-01	\N	t
395	7	5	0	36	2234.64	\N	t	2026-01-01	\N	t
396	8	5	0	12	744.88	\N	t	2026-01-01	\N	t
397	8	5	0	24	1489.76	\N	t	2026-01-01	\N	t
398	8	5	0	36	2234.64	\N	t	2026-01-01	\N	t
399	9	5	0	12	744.88	\N	t	2026-01-01	\N	t
400	9	5	0	24	1489.76	\N	t	2026-01-01	\N	t
401	9	5	0	36	2234.64	\N	t	2026-01-01	\N	t
402	10	5	0	12	744.88	\N	t	2026-01-01	\N	t
403	10	5	0	24	1489.76	\N	t	2026-01-01	\N	t
404	10	5	0	36	2234.64	\N	t	2026-01-01	\N	t
405	11	5	0	12	744.88	\N	t	2026-01-01	\N	t
406	11	5	0	24	1489.76	\N	t	2026-01-01	\N	t
407	11	5	0	36	2234.64	\N	t	2026-01-01	\N	t
408	12	5	0	12	744.88	\N	t	2026-01-01	\N	t
409	12	5	0	24	1489.76	\N	t	2026-01-01	\N	t
410	12	5	0	36	2234.64	\N	t	2026-01-01	\N	t
411	13	5	0	12	744.88	\N	t	2026-01-01	\N	t
412	13	5	0	24	1489.76	\N	t	2026-01-01	\N	t
413	13	5	0	36	2234.64	\N	t	2026-01-01	\N	t
414	14	5	0	12	744.88	\N	t	2026-01-01	\N	t
415	14	5	0	24	1489.76	\N	t	2026-01-01	\N	t
416	14	5	0	36	2234.64	\N	t	2026-01-01	\N	t
417	15	5	0	12	744.88	\N	t	2026-01-01	\N	t
418	15	5	0	24	1489.76	\N	t	2026-01-01	\N	t
419	15	5	0	36	2234.64	\N	t	2026-01-01	\N	t
420	16	5	0	12	744.88	\N	t	2026-01-01	\N	t
421	16	5	0	24	1489.76	\N	t	2026-01-01	\N	t
422	16	5	0	36	2234.64	\N	t	2026-01-01	\N	t
423	17	5	0	12	744.88	\N	t	2026-01-01	\N	t
424	17	5	0	24	1489.76	\N	t	2026-01-01	\N	t
425	17	5	0	36	2234.64	\N	t	2026-01-01	\N	t
426	1	6	0	12	1051.95	\N	f	2026-01-01	\N	t
427	1	6	0	12	1051.95	\N	t	2026-01-01	\N	t
428	1	6	0	24	2103.91	\N	f	2026-01-01	\N	t
429	1	6	0	24	2103.91	\N	t	2026-01-01	\N	t
430	1	6	0	36	3155.86	\N	f	2026-01-01	\N	t
431	1	6	0	36	3155.86	\N	t	2026-01-01	\N	t
432	1	6	0	48	4207.81	\N	f	2026-01-01	\N	t
433	1	6	0	48	4207.81	\N	t	2026-01-01	\N	t
434	1	6	0	60	5259.77	\N	f	2026-01-01	\N	t
435	1	6	0	60	5259.77	\N	t	2026-01-01	\N	t
436	2	6	0	12	1051.95	\N	f	2026-01-01	\N	t
437	2	6	0	12	1051.95	\N	t	2026-01-01	\N	t
438	2	6	0	24	2103.91	\N	f	2026-01-01	\N	t
439	2	6	0	24	2103.91	\N	t	2026-01-01	\N	t
440	2	6	0	36	3155.86	\N	f	2026-01-01	\N	t
441	2	6	0	36	3155.86	\N	t	2026-01-01	\N	t
442	2	6	0	48	4207.81	\N	f	2026-01-01	\N	t
443	2	6	0	48	4207.81	\N	t	2026-01-01	\N	t
444	2	6	0	60	5259.77	\N	f	2026-01-01	\N	t
445	2	6	0	60	5259.77	\N	t	2026-01-01	\N	t
446	3	6	0	12	1051.95	\N	f	2026-01-01	\N	t
447	3	6	0	12	1051.95	\N	t	2026-01-01	\N	t
448	3	6	0	24	2103.91	\N	f	2026-01-01	\N	t
449	3	6	0	24	2103.91	\N	t	2026-01-01	\N	t
450	3	6	0	36	3155.86	\N	f	2026-01-01	\N	t
451	3	6	0	36	3155.86	\N	t	2026-01-01	\N	t
452	3	6	0	48	4207.81	\N	f	2026-01-01	\N	t
453	3	6	0	48	4207.81	\N	t	2026-01-01	\N	t
454	3	6	0	60	5259.77	\N	f	2026-01-01	\N	t
455	3	6	0	60	5259.77	\N	t	2026-01-01	\N	t
456	4	6	0	12	1051.95	\N	f	2026-01-01	\N	t
457	4	6	0	12	1051.95	\N	t	2026-01-01	\N	t
458	4	6	0	24	2103.91	\N	f	2026-01-01	\N	t
459	4	6	0	24	2103.91	\N	t	2026-01-01	\N	t
460	4	6	0	36	3155.86	\N	f	2026-01-01	\N	t
461	4	6	0	36	3155.86	\N	t	2026-01-01	\N	t
462	4	6	0	48	4207.81	\N	f	2026-01-01	\N	t
463	4	6	0	48	4207.81	\N	t	2026-01-01	\N	t
464	4	6	0	60	5259.77	\N	f	2026-01-01	\N	t
465	4	6	0	60	5259.77	\N	t	2026-01-01	\N	t
466	5	6	0	12	1051.95	\N	f	2026-01-01	\N	t
467	5	6	0	12	1051.95	\N	t	2026-01-01	\N	t
468	5	6	0	24	2103.91	\N	f	2026-01-01	\N	t
469	5	6	0	24	2103.91	\N	t	2026-01-01	\N	t
470	5	6	0	36	3155.86	\N	f	2026-01-01	\N	t
471	5	6	0	36	3155.86	\N	t	2026-01-01	\N	t
472	5	6	0	48	4207.81	\N	f	2026-01-01	\N	t
473	5	6	0	48	4207.81	\N	t	2026-01-01	\N	t
474	5	6	0	60	5259.77	\N	f	2026-01-01	\N	t
475	5	6	0	60	5259.77	\N	t	2026-01-01	\N	t
476	6	6	0	12	1051.95	\N	f	2026-01-01	\N	t
477	6	6	0	12	1051.95	\N	t	2026-01-01	\N	t
478	6	6	0	24	2103.91	\N	f	2026-01-01	\N	t
479	6	6	0	24	2103.91	\N	t	2026-01-01	\N	t
480	6	6	0	36	3155.86	\N	f	2026-01-01	\N	t
481	6	6	0	36	3155.86	\N	t	2026-01-01	\N	t
482	6	6	0	48	4207.81	\N	f	2026-01-01	\N	t
483	6	6	0	48	4207.81	\N	t	2026-01-01	\N	t
484	6	6	0	60	5259.77	\N	f	2026-01-01	\N	t
485	6	6	0	60	5259.77	\N	t	2026-01-01	\N	t
486	7	6	0	12	1051.95	\N	f	2026-01-01	\N	t
487	7	6	0	12	1051.95	\N	t	2026-01-01	\N	t
488	7	6	0	24	2103.91	\N	f	2026-01-01	\N	t
489	7	6	0	24	2103.91	\N	t	2026-01-01	\N	t
490	7	6	0	36	3155.86	\N	f	2026-01-01	\N	t
491	7	6	0	36	3155.86	\N	t	2026-01-01	\N	t
492	7	6	0	48	4207.81	\N	f	2026-01-01	\N	t
493	7	6	0	48	4207.81	\N	t	2026-01-01	\N	t
494	7	6	0	60	5259.77	\N	f	2026-01-01	\N	t
495	7	6	0	60	5259.77	\N	t	2026-01-01	\N	t
496	8	6	0	12	1051.95	\N	f	2026-01-01	\N	t
497	8	6	0	12	1051.95	\N	t	2026-01-01	\N	t
498	8	6	0	24	2103.91	\N	f	2026-01-01	\N	t
499	8	6	0	24	2103.91	\N	t	2026-01-01	\N	t
500	8	6	0	36	3155.86	\N	f	2026-01-01	\N	t
501	8	6	0	36	3155.86	\N	t	2026-01-01	\N	t
502	8	6	0	48	4207.81	\N	f	2026-01-01	\N	t
503	8	6	0	48	4207.81	\N	t	2026-01-01	\N	t
504	8	6	0	60	5259.77	\N	f	2026-01-01	\N	t
505	8	6	0	60	5259.77	\N	t	2026-01-01	\N	t
506	9	6	0	12	1051.95	\N	f	2026-01-01	\N	t
507	9	6	0	12	1051.95	\N	t	2026-01-01	\N	t
508	9	6	0	24	2103.91	\N	f	2026-01-01	\N	t
509	9	6	0	24	2103.91	\N	t	2026-01-01	\N	t
510	9	6	0	36	3155.86	\N	f	2026-01-01	\N	t
511	9	6	0	36	3155.86	\N	t	2026-01-01	\N	t
512	9	6	0	48	4207.81	\N	f	2026-01-01	\N	t
513	9	6	0	48	4207.81	\N	t	2026-01-01	\N	t
514	9	6	0	60	5259.77	\N	f	2026-01-01	\N	t
515	9	6	0	60	5259.77	\N	t	2026-01-01	\N	t
516	10	6	0	12	1051.95	\N	f	2026-01-01	\N	t
517	10	6	0	12	1051.95	\N	t	2026-01-01	\N	t
518	10	6	0	24	2103.91	\N	f	2026-01-01	\N	t
519	10	6	0	24	2103.91	\N	t	2026-01-01	\N	t
520	10	6	0	36	3155.86	\N	f	2026-01-01	\N	t
521	10	6	0	36	3155.86	\N	t	2026-01-01	\N	t
522	10	6	0	48	4207.81	\N	f	2026-01-01	\N	t
523	10	6	0	48	4207.81	\N	t	2026-01-01	\N	t
524	10	6	0	60	5259.77	\N	f	2026-01-01	\N	t
525	10	6	0	60	5259.77	\N	t	2026-01-01	\N	t
526	11	6	0	12	1051.95	\N	f	2026-01-01	\N	t
527	11	6	0	12	1051.95	\N	t	2026-01-01	\N	t
528	11	6	0	24	2103.91	\N	f	2026-01-01	\N	t
529	11	6	0	24	2103.91	\N	t	2026-01-01	\N	t
530	11	6	0	36	3155.86	\N	f	2026-01-01	\N	t
531	11	6	0	36	3155.86	\N	t	2026-01-01	\N	t
532	11	6	0	48	4207.81	\N	f	2026-01-01	\N	t
533	11	6	0	48	4207.81	\N	t	2026-01-01	\N	t
534	11	6	0	60	5259.77	\N	f	2026-01-01	\N	t
535	11	6	0	60	5259.77	\N	t	2026-01-01	\N	t
536	12	6	0	12	1051.95	\N	f	2026-01-01	\N	t
537	12	6	0	12	1051.95	\N	t	2026-01-01	\N	t
538	12	6	0	24	2103.91	\N	f	2026-01-01	\N	t
539	12	6	0	24	2103.91	\N	t	2026-01-01	\N	t
540	12	6	0	36	3155.86	\N	f	2026-01-01	\N	t
541	12	6	0	36	3155.86	\N	t	2026-01-01	\N	t
542	12	6	0	48	4207.81	\N	f	2026-01-01	\N	t
543	12	6	0	48	4207.81	\N	t	2026-01-01	\N	t
544	12	6	0	60	5259.77	\N	f	2026-01-01	\N	t
545	12	6	0	60	5259.77	\N	t	2026-01-01	\N	t
546	13	6	0	12	1051.95	\N	f	2026-01-01	\N	t
547	13	6	0	12	1051.95	\N	t	2026-01-01	\N	t
548	13	6	0	24	2103.91	\N	f	2026-01-01	\N	t
549	13	6	0	24	2103.91	\N	t	2026-01-01	\N	t
550	13	6	0	36	3155.86	\N	f	2026-01-01	\N	t
551	13	6	0	36	3155.86	\N	t	2026-01-01	\N	t
552	13	6	0	48	4207.81	\N	f	2026-01-01	\N	t
553	13	6	0	48	4207.81	\N	t	2026-01-01	\N	t
554	13	6	0	60	5259.77	\N	f	2026-01-01	\N	t
555	13	6	0	60	5259.77	\N	t	2026-01-01	\N	t
556	14	6	0	12	1051.95	\N	f	2026-01-01	\N	t
557	14	6	0	12	1051.95	\N	t	2026-01-01	\N	t
558	14	6	0	24	2103.91	\N	f	2026-01-01	\N	t
559	14	6	0	24	2103.91	\N	t	2026-01-01	\N	t
560	14	6	0	36	3155.86	\N	f	2026-01-01	\N	t
561	14	6	0	36	3155.86	\N	t	2026-01-01	\N	t
562	14	6	0	48	4207.81	\N	f	2026-01-01	\N	t
563	14	6	0	48	4207.81	\N	t	2026-01-01	\N	t
564	14	6	0	60	5259.77	\N	f	2026-01-01	\N	t
565	14	6	0	60	5259.77	\N	t	2026-01-01	\N	t
566	15	6	0	12	1051.95	\N	f	2026-01-01	\N	t
567	15	6	0	12	1051.95	\N	t	2026-01-01	\N	t
568	15	6	0	24	2103.91	\N	f	2026-01-01	\N	t
569	15	6	0	24	2103.91	\N	t	2026-01-01	\N	t
570	15	6	0	36	3155.86	\N	f	2026-01-01	\N	t
571	15	6	0	36	3155.86	\N	t	2026-01-01	\N	t
572	15	6	0	48	4207.81	\N	f	2026-01-01	\N	t
573	15	6	0	48	4207.81	\N	t	2026-01-01	\N	t
574	15	6	0	60	5259.77	\N	f	2026-01-01	\N	t
575	15	6	0	60	5259.77	\N	t	2026-01-01	\N	t
576	16	6	0	12	1051.95	\N	f	2026-01-01	\N	t
577	16	6	0	12	1051.95	\N	t	2026-01-01	\N	t
578	16	6	0	24	2103.91	\N	f	2026-01-01	\N	t
579	16	6	0	24	2103.91	\N	t	2026-01-01	\N	t
580	16	6	0	36	3155.86	\N	f	2026-01-01	\N	t
581	16	6	0	36	3155.86	\N	t	2026-01-01	\N	t
582	16	6	0	48	4207.81	\N	f	2026-01-01	\N	t
583	16	6	0	48	4207.81	\N	t	2026-01-01	\N	t
584	16	6	0	60	5259.77	\N	f	2026-01-01	\N	t
585	16	6	0	60	5259.77	\N	t	2026-01-01	\N	t
586	17	6	0	12	1051.95	\N	f	2026-01-01	\N	t
587	17	6	0	12	1051.95	\N	t	2026-01-01	\N	t
588	17	6	0	24	2103.91	\N	f	2026-01-01	\N	t
589	17	6	0	24	2103.91	\N	t	2026-01-01	\N	t
590	17	6	0	36	3155.86	\N	f	2026-01-01	\N	t
591	17	6	0	36	3155.86	\N	t	2026-01-01	\N	t
592	17	6	0	48	4207.81	\N	f	2026-01-01	\N	t
593	17	6	0	48	4207.81	\N	t	2026-01-01	\N	t
594	17	6	0	60	5259.77	\N	f	2026-01-01	\N	t
595	17	6	0	60	5259.77	\N	t	2026-01-01	\N	t
\.


--
-- Data for Name: tarifas_por_categoria; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tarifas_por_categoria (id, item_id, categoria, monto, tipo_monto, vigente_desde, vigente_hasta) FROM stdin;
1	21	A	19865.7800	mensual	2026-01-01	\N
2	21	N	9932.8900	mensual	2026-01-01	\N
3	21	S	9932.8900	mensual	2026-01-01	\N
4	22	PARASAR	19477.8500	mensual	2026-01-01	\N
5	22	RESCATISTA	13912.0300	mensual	2026-01-01	\N
6	22	OPERADOR_GRUA	10434.0300	mensual	2026-01-01	\N
7	22	MEDICO	6956.0200	mensual	2026-01-01	\N
\.


--
-- Data for Name: tipos_beneficio; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tipos_beneficio (id, codigo, nombre, es_mensual, permite_retroactividad, plazo_presentacion_dias, monto_referencia, catalogo_item_id, activo) FROM stdin;
6	PRIMA_NACIMIENTO	Prima por Nacimiento	f	f	60	8011.68	44	t
7	PRIMA_MATRIMONIO	Prima por Matrimonio	f	f	60	8011.68	43	t
4	PRIMA_NACIMIENTO_MATRIMONIO	Prima por Nacimiento o Matrimonio	f	f	60	\N	\N	f
3	ASIGNACION_FAMILIAR	Asignación Familiar	t	t	\N	\N	45	t
1	HOGAR_CONSTITUIDO	Hogar Constituido	t	t	\N	\N	42	t
2	PRIMA_SOLIDARIA_FAMILIAR	Prima Solidaria Familiar	t	t	\N	\N	41	t
5	PRIMA_TRASLADO	Prima por Traslado	f	f	\N	\N	57	t
\.


--
-- Data for Name: tipos_compensacion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tipos_compensacion (id, codigo, nombre, unidad_medida, requiere_fuente, vigente) FROM stdin;
1	BARRERA_SANITARIA	Barrera Sanitaria (Convenio MDN-MGAP)	dia	t	t
2	ASIDUIDAD_VUELO	Compensación Especial por Asiduidad de Vuelo	monto	f	t
3	CARCEL	Viático Cárceles / Prima Seguridad Perimetral	dia	t	t
6	PAN_FAU	Compensación PAN - Policía Aérea Nacional	monto	f	t
7	PLAN_FRONTERA	Plan Frontera - Control Fronterizo (042.573)	dia	t	t
8	PRIMA_IDONEIDAD	Prima de Idoneidad	monto	f	t
9	SAR	Compensación SAR - Búsqueda y Rescate (042.572)	monto	t	t
10	RIESGO_VUELO	Riesgo de Vuelo (042.019)	monto	t	t
5	NOCTURNIDAD	Nocturnidad (052.001)	dia	t	t
\.


--
-- Data for Name: tipos_movimiento; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tipos_movimiento (id, nombre, es_alta) FROM stdin;
1	Alta por ingreso.	t
2	Alta reserva.	t
3	Alta por Ascenso	t
4	Pase	t
5	Reincorporacion	t
6	Reintegro	t
7	Baja	f
8	Retiro	f
9	Baja por Ascenso	f
10	Ascenso	f
11	Cambio de Situacion	f
12	Licencia Sin Goce	f
\.


--
-- Data for Name: tramos_sanidad_militar; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tramos_sanidad_militar (id, desde, hasta, porcentaje, codigo_retencion, vigente_desde, vigente_hasta) FROM stdin;
1	0.00	17160.00	0.0100	5010	2026-01-01	\N
2	17160.01	34320.00	0.0250	5011	2026-01-01	\N
3	34320.01	\N	0.0400	5012	2026-01-01	\N
\.


--
-- Data for Name: unidades; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.unidades (id, codigo, denominacion, vigente) FROM stdin;
1	CAO	C.A.O.	t
2	CAP	C.A.P.	t
3	CAL	C.A.L.	t
4	CG	C.G.	t
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usuarios (id, username, password_hash, estado, intentos_fallidos, bloqueado_hasta, persona_id, fecha_actualizacion) FROM stdin;
\.


--
-- Data for Name: usuarios_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usuarios_roles (usuario_id, rol_id) FROM stdin;
\.


--
-- Name: acciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.acciones_id_seq', 107, true);


--
-- Name: acreedores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.acreedores_id_seq', 71, true);


--
-- Name: aguinaldo_baja_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.aguinaldo_baja_id_seq', 1, false);


--
-- Name: aguinaldos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.aguinaldos_id_seq', 1, false);


--
-- Name: bancos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bancos_id_seq', 1, true);


--
-- Name: beneficio_social_beneficiarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.beneficio_social_beneficiarios_id_seq', 1, false);


--
-- Name: beneficios_sociales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.beneficios_sociales_id_seq', 1, false);


--
-- Name: bitacora_auditoria_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.bitacora_auditoria_id_seq', 1, false);


--
-- Name: catalogo_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.catalogo_items_id_seq', 209, true);


--
-- Name: cierres_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cierres_id_seq', 1, false);


--
-- Name: compensaciones_diferencia_ascenso_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.compensaciones_diferencia_ascenso_id_seq', 1, false);


--
-- Name: config_compensaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.config_compensaciones_id_seq', 10, true);


--
-- Name: contextos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.contextos_id_seq', 16, true);


--
-- Name: cuentas_bancarias_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cuentas_bancarias_id_seq', 1, false);


--
-- Name: dependientes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dependientes_id_seq', 1, false);


--
-- Name: descuentos_personal_periodo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.descuentos_personal_periodo_id_seq', 1, false);


--
-- Name: descuentos_personales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.descuentos_personales_id_seq', 1, false);


--
-- Name: documentos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.documentos_id_seq', 1, false);


--
-- Name: escalafones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.escalafones_id_seq', 17, true);


--
-- Name: form3100_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.form3100_id_seq', 1, false);


--
-- Name: form3100_personas_cargo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.form3100_personas_cargo_id_seq', 1, false);


--
-- Name: franjas_irpf_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.franjas_irpf_id_seq', 15, true);


--
-- Name: grados_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.grados_id_seq', 31, true);


--
-- Name: historico_liquidaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.historico_liquidaciones_id_seq', 1, false);


--
-- Name: incidencias_calculo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.incidencias_calculo_id_seq', 1, false);


--
-- Name: instructivo_asig_familiar_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.instructivo_asig_familiar_id_seq', 3, true);


--
-- Name: instructivo_psf_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.instructivo_psf_id_seq', 5, true);


--
-- Name: irpf_detalle_franjas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.irpf_detalle_franjas_id_seq', 1, false);


--
-- Name: irpf_mensual_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.irpf_mensual_id_seq', 1, false);


--
-- Name: items_aguinaldo_baja_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.items_aguinaldo_baja_id_seq', 1, false);


--
-- Name: items_liquidacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.items_liquidacion_id_seq', 1, false);


--
-- Name: items_lote_compensacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.items_lote_compensacion_id_seq', 1, false);


--
-- Name: liquidacion_estados_personal_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.liquidacion_estados_personal_id_seq', 1, false);


--
-- Name: liquidacion_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.liquidacion_items_id_seq', 1, false);


--
-- Name: liquidacion_resumenes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.liquidacion_resumenes_id_seq', 1, false);


--
-- Name: liquidaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.liquidaciones_id_seq', 1, false);


--
-- Name: lotes_compensacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.lotes_compensacion_id_seq', 1, false);


--
-- Name: motivos_baja_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.motivos_baja_id_seq', 11, true);


--
-- Name: movimientos_laborales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.movimientos_laborales_id_seq', 1, false);


--
-- Name: novedades_periodo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.novedades_periodo_id_seq', 1, false);


--
-- Name: parametros_periodo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.parametros_periodo_id_seq', 7, true);


--
-- Name: periodos_liquidacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.periodos_liquidacion_id_seq', 1, false);


--
-- Name: personas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.personas_id_seq', 1, false);


--
-- Name: programas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.programas_id_seq', 2, true);


--
-- Name: regimenes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.regimenes_id_seq', 2, true);


--
-- Name: reglas_ascenso_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reglas_ascenso_id_seq', 3, true);


--
-- Name: relaciones_laborales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.relaciones_laborales_id_seq', 1, false);


--
-- Name: remuneraciones_grado_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.remuneraciones_grado_id_seq', 489, true);


--
-- Name: retroactividad_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retroactividad_items_id_seq', 1, false);


--
-- Name: retroactividades_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.retroactividades_id_seq', 1, false);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_id_seq', 3, true);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.schema_migrations_id_seq', 18, true);


--
-- Name: situaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.situaciones_id_seq', 22, true);


--
-- Name: snapshots_insumos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.snapshots_insumos_id_seq', 1, false);


--
-- Name: sub_unidades_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sub_unidades_id_seq', 18, true);


--
-- Name: tabla_hogar_constituido_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tabla_hogar_constituido_id_seq', 6, true);


--
-- Name: tabla_permanencia_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tabla_permanencia_id_seq', 595, true);


--
-- Name: tarifas_por_categoria_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tarifas_por_categoria_id_seq', 7, true);


--
-- Name: tipos_beneficio_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tipos_beneficio_id_seq', 7, true);


--
-- Name: tipos_compensacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tipos_compensacion_id_seq', 10, true);


--
-- Name: tipos_movimiento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tipos_movimiento_id_seq', 12, true);


--
-- Name: tramos_sanidad_militar_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tramos_sanidad_militar_id_seq', 3, true);


--
-- Name: unidades_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.unidades_id_seq', 4, true);


--
-- Name: usuarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.usuarios_id_seq', 1, false);


--
-- Name: acciones acciones_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acciones
    ADD CONSTRAINT acciones_nombre_key UNIQUE (nombre);


--
-- Name: acciones acciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acciones
    ADD CONSTRAINT acciones_pkey PRIMARY KEY (id);


--
-- Name: acreedores acreedores_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acreedores
    ADD CONSTRAINT acreedores_codigo_key UNIQUE (codigo);


--
-- Name: acreedores acreedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acreedores
    ADD CONSTRAINT acreedores_pkey PRIMARY KEY (id);


--
-- Name: aguinaldo_baja aguinaldo_baja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aguinaldo_baja
    ADD CONSTRAINT aguinaldo_baja_pkey PRIMARY KEY (id);


--
-- Name: aguinaldos aguinaldos_persona_id_anio_semestre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aguinaldos
    ADD CONSTRAINT aguinaldos_persona_id_anio_semestre_key UNIQUE (persona_id, anio, semestre);


--
-- Name: aguinaldos aguinaldos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aguinaldos
    ADD CONSTRAINT aguinaldos_pkey PRIMARY KEY (id);


--
-- Name: bancos bancos_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bancos
    ADD CONSTRAINT bancos_codigo_key UNIQUE (codigo);


--
-- Name: bancos bancos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bancos
    ADD CONSTRAINT bancos_pkey PRIMARY KEY (id);


--
-- Name: beneficio_social_beneficiarios beneficio_social_beneficiarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficio_social_beneficiarios
    ADD CONSTRAINT beneficio_social_beneficiarios_pkey PRIMARY KEY (id);


--
-- Name: beneficios_sociales beneficios_sociales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficios_sociales
    ADD CONSTRAINT beneficios_sociales_pkey PRIMARY KEY (id);


--
-- Name: bitacora_auditoria bitacora_auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_auditoria
    ADD CONSTRAINT bitacora_auditoria_pkey PRIMARY KEY (id);


--
-- Name: catalogo_items catalogo_items_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_items
    ADD CONSTRAINT catalogo_items_codigo_key UNIQUE (codigo);


--
-- Name: catalogo_items catalogo_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_items
    ADD CONSTRAINT catalogo_items_pkey PRIMARY KEY (id);


--
-- Name: cierres cierres_liquidacion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres
    ADD CONSTRAINT cierres_liquidacion_id_key UNIQUE (liquidacion_id);


--
-- Name: cierres cierres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres
    ADD CONSTRAINT cierres_pkey PRIMARY KEY (id);


--
-- Name: compensaciones_diferencia_ascenso compensaciones_diferencia_ascenso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compensaciones_diferencia_ascenso
    ADD CONSTRAINT compensaciones_diferencia_ascenso_pkey PRIMARY KEY (id);


--
-- Name: config_compensaciones config_compensaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_compensaciones
    ADD CONSTRAINT config_compensaciones_pkey PRIMARY KEY (id);


--
-- Name: contextos contextos_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contextos
    ADD CONSTRAINT contextos_nombre_key UNIQUE (nombre);


--
-- Name: contextos contextos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contextos
    ADD CONSTRAINT contextos_pkey PRIMARY KEY (id);


--
-- Name: cuentas_bancarias cuentas_bancarias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_bancarias
    ADD CONSTRAINT cuentas_bancarias_pkey PRIMARY KEY (id);


--
-- Name: dependientes dependientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dependientes
    ADD CONSTRAINT dependientes_pkey PRIMARY KEY (id);


--
-- Name: descuentos_personal_periodo descuentos_personal_periodo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personal_periodo
    ADD CONSTRAINT descuentos_personal_periodo_pkey PRIMARY KEY (id);


--
-- Name: descuentos_personales descuentos_personales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personales
    ADD CONSTRAINT descuentos_personales_pkey PRIMARY KEY (id);


--
-- Name: documentos documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_pkey PRIMARY KEY (id);


--
-- Name: escalafones escalafones_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalafones
    ADD CONSTRAINT escalafones_codigo_key UNIQUE (codigo);


--
-- Name: escalafones escalafones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalafones
    ADD CONSTRAINT escalafones_pkey PRIMARY KEY (id);


--
-- Name: form3100 form3100_persona_id_vigente_desde_anio_vigente_desde_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100
    ADD CONSTRAINT form3100_persona_id_vigente_desde_anio_vigente_desde_mes_key UNIQUE (persona_id, vigente_desde_anio, vigente_desde_mes);


--
-- Name: form3100_personas_cargo form3100_personas_cargo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100_personas_cargo
    ADD CONSTRAINT form3100_personas_cargo_pkey PRIMARY KEY (id);


--
-- Name: form3100 form3100_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100
    ADD CONSTRAINT form3100_pkey PRIMARY KEY (id);


--
-- Name: franjas_irpf franjas_irpf_numero_franja_vigente_desde_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franjas_irpf
    ADD CONSTRAINT franjas_irpf_numero_franja_vigente_desde_key UNIQUE (numero_franja, vigente_desde);


--
-- Name: franjas_irpf franjas_irpf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franjas_irpf
    ADD CONSTRAINT franjas_irpf_pkey PRIMARY KEY (id);


--
-- Name: grados grados_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grados
    ADD CONSTRAINT grados_codigo_key UNIQUE (codigo);


--
-- Name: grados grados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grados
    ADD CONSTRAINT grados_pkey PRIMARY KEY (id);


--
-- Name: historico_liquidaciones historico_liquidaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT historico_liquidaciones_pkey PRIMARY KEY (id);


--
-- Name: incidencias_calculo incidencias_calculo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias_calculo
    ADD CONSTRAINT incidencias_calculo_pkey PRIMARY KEY (id);


--
-- Name: instructivo_asig_familiar instructivo_asig_familiar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructivo_asig_familiar
    ADD CONSTRAINT instructivo_asig_familiar_pkey PRIMARY KEY (id);


--
-- Name: instructivo_psf instructivo_psf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructivo_psf
    ADD CONSTRAINT instructivo_psf_pkey PRIMARY KEY (id);


--
-- Name: irpf_detalle_franjas irpf_detalle_franjas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_detalle_franjas
    ADD CONSTRAINT irpf_detalle_franjas_pkey PRIMARY KEY (id);


--
-- Name: irpf_mensual irpf_mensual_liquidacion_id_persona_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_mensual
    ADD CONSTRAINT irpf_mensual_liquidacion_id_persona_id_key UNIQUE (liquidacion_id, persona_id);


--
-- Name: irpf_mensual irpf_mensual_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_mensual
    ADD CONSTRAINT irpf_mensual_pkey PRIMARY KEY (id);


--
-- Name: items_aguinaldo_baja items_aguinaldo_baja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_aguinaldo_baja
    ADD CONSTRAINT items_aguinaldo_baja_pkey PRIMARY KEY (id);


--
-- Name: items_liquidacion items_liquidacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_liquidacion
    ADD CONSTRAINT items_liquidacion_pkey PRIMARY KEY (id);


--
-- Name: items_lote_compensacion items_lote_compensacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_lote_compensacion
    ADD CONSTRAINT items_lote_compensacion_pkey PRIMARY KEY (id);


--
-- Name: liquidacion_estados_personal liquidacion_estados_personal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_estados_personal
    ADD CONSTRAINT liquidacion_estados_personal_pkey PRIMARY KEY (id);


--
-- Name: liquidacion_items liquidacion_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_items
    ADD CONSTRAINT liquidacion_items_pkey PRIMARY KEY (id);


--
-- Name: liquidacion_resumenes liquidacion_resumenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_resumenes
    ADD CONSTRAINT liquidacion_resumenes_pkey PRIMARY KEY (id);


--
-- Name: liquidaciones liquidaciones_anio_mes_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_anio_mes_version_key UNIQUE (anio, mes, version);


--
-- Name: liquidaciones liquidaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_pkey PRIMARY KEY (id);


--
-- Name: lotes_compensacion lotes_compensacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_compensacion
    ADD CONSTRAINT lotes_compensacion_pkey PRIMARY KEY (id);


--
-- Name: motivos_baja motivos_baja_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motivos_baja
    ADD CONSTRAINT motivos_baja_codigo_key UNIQUE (codigo);


--
-- Name: motivos_baja motivos_baja_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motivos_baja
    ADD CONSTRAINT motivos_baja_pkey PRIMARY KEY (id);


--
-- Name: movimientos_laborales movimientos_laborales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_laborales
    ADD CONSTRAINT movimientos_laborales_pkey PRIMARY KEY (id);


--
-- Name: novedades_periodo novedades_periodo_periodo_id_persona_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_periodo
    ADD CONSTRAINT novedades_periodo_periodo_id_persona_id_tipo_key UNIQUE (periodo_id, persona_id, tipo);


--
-- Name: novedades_periodo novedades_periodo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_periodo
    ADD CONSTRAINT novedades_periodo_pkey PRIMARY KEY (id);


--
-- Name: parametros_periodo parametros_periodo_anio_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_periodo
    ADD CONSTRAINT parametros_periodo_anio_mes_key UNIQUE (anio, mes);


--
-- Name: parametros_periodo parametros_periodo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_periodo
    ADD CONSTRAINT parametros_periodo_pkey PRIMARY KEY (id);


--
-- Name: periodos_liquidacion periodos_liquidacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_liquidacion
    ADD CONSTRAINT periodos_liquidacion_pkey PRIMARY KEY (id);


--
-- Name: personas personas_cedula_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personas
    ADD CONSTRAINT personas_cedula_key UNIQUE (cedula);


--
-- Name: personas personas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personas
    ADD CONSTRAINT personas_pkey PRIMARY KEY (id);


--
-- Name: programas programas_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas
    ADD CONSTRAINT programas_codigo_key UNIQUE (codigo);


--
-- Name: programas programas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programas
    ADD CONSTRAINT programas_pkey PRIMARY KEY (id);


--
-- Name: regimenes regimenes_numero_ley_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regimenes
    ADD CONSTRAINT regimenes_numero_ley_key UNIQUE (numero_ley);


--
-- Name: regimenes regimenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regimenes
    ADD CONSTRAINT regimenes_pkey PRIMARY KEY (id);


--
-- Name: reglas_ascenso reglas_ascenso_grado_origen_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_ascenso
    ADD CONSTRAINT reglas_ascenso_grado_origen_id_key UNIQUE (grado_origen_id);


--
-- Name: reglas_ascenso reglas_ascenso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_ascenso
    ADD CONSTRAINT reglas_ascenso_pkey PRIMARY KEY (id);


--
-- Name: relaciones_laborales relaciones_laborales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_pkey PRIMARY KEY (id);


--
-- Name: remuneraciones_grado remuneraciones_grado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remuneraciones_grado
    ADD CONSTRAINT remuneraciones_grado_pkey PRIMARY KEY (id);


--
-- Name: retroactividad_items retroactividad_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividad_items
    ADD CONSTRAINT retroactividad_items_pkey PRIMARY KEY (id);


--
-- Name: retroactividades retroactividades_periodo_id_persona_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividades
    ADD CONSTRAINT retroactividades_periodo_id_persona_id_tipo_key UNIQUE (periodo_id, persona_id, tipo);


--
-- Name: retroactividades retroactividades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividades
    ADD CONSTRAINT retroactividades_pkey PRIMARY KEY (id);


--
-- Name: roles roles_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_nombre_key UNIQUE (nombre);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_version_key UNIQUE (version);


--
-- Name: situaciones situaciones_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.situaciones
    ADD CONSTRAINT situaciones_codigo_key UNIQUE (codigo);


--
-- Name: situaciones situaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.situaciones
    ADD CONSTRAINT situaciones_pkey PRIMARY KEY (id);


--
-- Name: snapshots_insumos snapshots_insumos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snapshots_insumos
    ADD CONSTRAINT snapshots_insumos_pkey PRIMARY KEY (id);


--
-- Name: sub_unidades sub_unidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_unidades
    ADD CONSTRAINT sub_unidades_pkey PRIMARY KEY (id);


--
-- Name: sub_unidades sub_unidades_unidad_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_unidades
    ADD CONSTRAINT sub_unidades_unidad_id_codigo_key UNIQUE (unidad_id, codigo);


--
-- Name: tabla_hogar_constituido tabla_hogar_constituido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabla_hogar_constituido
    ADD CONSTRAINT tabla_hogar_constituido_pkey PRIMARY KEY (id);


--
-- Name: tabla_permanencia tabla_permanencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabla_permanencia
    ADD CONSTRAINT tabla_permanencia_pkey PRIMARY KEY (id);


--
-- Name: tarifas_por_categoria tarifas_por_categoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas_por_categoria
    ADD CONSTRAINT tarifas_por_categoria_pkey PRIMARY KEY (id);


--
-- Name: tipos_beneficio tipos_beneficio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_beneficio
    ADD CONSTRAINT tipos_beneficio_pkey PRIMARY KEY (id);


--
-- Name: tipos_compensacion tipos_compensacion_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_compensacion
    ADD CONSTRAINT tipos_compensacion_codigo_key UNIQUE (codigo);


--
-- Name: tipos_compensacion tipos_compensacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_compensacion
    ADD CONSTRAINT tipos_compensacion_pkey PRIMARY KEY (id);


--
-- Name: tipos_movimiento tipos_movimiento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_movimiento
    ADD CONSTRAINT tipos_movimiento_pkey PRIMARY KEY (id);


--
-- Name: tramos_sanidad_militar tramos_sanidad_militar_codigo_retencion_vigente_desde_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramos_sanidad_militar
    ADD CONSTRAINT tramos_sanidad_militar_codigo_retencion_vigente_desde_key UNIQUE (codigo_retencion, vigente_desde);


--
-- Name: tramos_sanidad_militar tramos_sanidad_militar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tramos_sanidad_militar
    ADD CONSTRAINT tramos_sanidad_militar_pkey PRIMARY KEY (id);


--
-- Name: unidades unidades_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_codigo_key UNIQUE (codigo);


--
-- Name: unidades unidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_pkey PRIMARY KEY (id);


--
-- Name: historico_liquidaciones uq_historico_persona_anio_mes; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT uq_historico_persona_anio_mes UNIQUE (persona_id, anio, mes);


--
-- Name: tipos_movimiento uq_tipos_movimiento_nombre; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_movimiento
    ADD CONSTRAINT uq_tipos_movimiento_nombre UNIQUE (nombre);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios_roles usuarios_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_pkey PRIMARY KEY (usuario_id, rol_id);


--
-- Name: usuarios usuarios_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_username_key UNIQUE (username);


--
-- Name: idx_aguinaldo_baja_anio_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aguinaldo_baja_anio_mes ON public.aguinaldo_baja USING btree (anio, mes);


--
-- Name: idx_aguinaldo_baja_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aguinaldo_baja_estado ON public.aguinaldo_baja USING btree (estado);


--
-- Name: idx_aguinaldo_baja_persona_fecha_baja; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_aguinaldo_baja_persona_fecha_baja ON public.aguinaldo_baja USING btree (persona_id, fecha_baja);


--
-- Name: idx_beneficio_beneficiarios_beneficio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beneficio_beneficiarios_beneficio ON public.beneficio_social_beneficiarios USING btree (beneficio_id, activo);


--
-- Name: idx_beneficio_beneficiarios_cedula; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beneficio_beneficiarios_cedula ON public.beneficio_social_beneficiarios USING btree (cedula) WHERE (cedula IS NOT NULL);


--
-- Name: idx_beneficios_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beneficios_persona ON public.beneficios_sociales USING btree (persona_id, estado);


--
-- Name: idx_beneficios_persona_tipo_clave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beneficios_persona_tipo_clave ON public.beneficios_sociales USING btree (persona_id, tipo_beneficio_id, clave_evento);


--
-- Name: idx_beneficios_retro_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beneficios_retro_pendiente ON public.beneficios_sociales USING btree (retroactividad_pendiente);


--
-- Name: idx_beneficios_tipo_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beneficios_tipo_estado ON public.beneficios_sociales USING btree (tipo_beneficio_id, estado);


--
-- Name: idx_comp_diff_asc_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comp_diff_asc_estado ON public.compensaciones_diferencia_ascenso USING btree (estado);


--
-- Name: idx_comp_diff_asc_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comp_diff_asc_periodo ON public.compensaciones_diferencia_ascenso USING btree (periodo_id);


--
-- Name: idx_comp_diff_asc_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comp_diff_asc_persona ON public.compensaciones_diferencia_ascenso USING btree (persona_id);


--
-- Name: idx_descuentos_acreedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_descuentos_acreedor ON public.descuentos_personales USING btree (acreedor_id, periodo_anio, periodo_mes);


--
-- Name: idx_descuentos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_descuentos_estado ON public.descuentos_personales USING btree (estado);


--
-- Name: idx_descuentos_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_descuentos_persona ON public.descuentos_personales USING btree (persona_id, periodo_anio, periodo_mes);


--
-- Name: idx_incidencias_calculo_periodo_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidencias_calculo_periodo_persona ON public.incidencias_calculo USING btree (periodo_id, persona_id);


--
-- Name: idx_instructivo_asig_familiar_vigencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructivo_asig_familiar_vigencia ON public.instructivo_asig_familiar USING btree (vigente_desde, tipo_franja);


--
-- Name: idx_instructivo_psf_vigencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructivo_psf_vigencia ON public.instructivo_psf USING btree (vigente_desde, numero_categoria);


--
-- Name: idx_items_aguinaldo_baja_aguinaldo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_aguinaldo_baja_aguinaldo ON public.items_aguinaldo_baja USING btree (aguinaldo_baja_id);


--
-- Name: idx_items_aguinaldo_baja_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_aguinaldo_baja_tipo ON public.items_aguinaldo_baja USING btree (tipo);


--
-- Name: idx_items_liquidacion_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_liquidacion_codigo ON public.items_liquidacion USING btree (codigo_item);


--
-- Name: idx_items_liquidacion_liq_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_liquidacion_liq_persona ON public.items_liquidacion USING btree (liquidacion_id, persona_id);


--
-- Name: idx_items_liquidacion_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_liquidacion_persona ON public.items_liquidacion USING btree (persona_id);


--
-- Name: idx_liquidacion_estados_personal_periodo_cedula_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidacion_estados_personal_periodo_cedula_version ON public.liquidacion_estados_personal USING btree (periodo_id, cedula, version);


--
-- Name: idx_liquidacion_items_periodo_cedula_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidacion_items_periodo_cedula_version ON public.liquidacion_items USING btree (periodo_id, cedula, version);


--
-- Name: idx_liquidacion_items_periodo_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidacion_items_periodo_version ON public.liquidacion_items USING btree (periodo_id, version);


--
-- Name: idx_liquidacion_resumenes_periodo_version_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidacion_resumenes_periodo_version_grupo ON public.liquidacion_resumenes USING btree (periodo_id, version, programa_id, regimen_id, rubro_083);


--
-- Name: idx_liquidaciones_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_liquidaciones_estado ON public.liquidaciones USING btree (estado);


--
-- Name: idx_novedades_periodo_periodo_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_novedades_periodo_periodo_estado ON public.novedades_periodo USING btree (periodo_id, estado);


--
-- Name: idx_novedades_periodo_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_novedades_periodo_persona ON public.novedades_periodo USING btree (persona_id);


--
-- Name: idx_periodos_liquidacion_anio_mes_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_periodos_liquidacion_anio_mes_activo ON public.periodos_liquidacion USING btree (anio, mes) WHERE (activo = true);


--
-- Name: idx_periodos_liquidacion_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_periodos_liquidacion_estado ON public.periodos_liquidacion USING btree (estado);


--
-- Name: idx_relaciones_laborales_grado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_relaciones_laborales_grado ON public.relaciones_laborales USING btree (grado_id);


--
-- Name: idx_relaciones_laborales_persona_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_relaciones_laborales_persona_activo ON public.relaciones_laborales USING btree (persona_id, estado);


--
-- Name: idx_relaciones_laborales_unidad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_relaciones_laborales_unidad ON public.relaciones_laborales USING btree (unidad_id);


--
-- Name: idx_remuneraciones_grado_vigencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_remuneraciones_grado_vigencia ON public.remuneraciones_grado USING btree (grado_id, item_id, vigente_desde);


--
-- Name: idx_retroactividad_items_retro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retroactividad_items_retro ON public.retroactividad_items USING btree (retroactividad_id);


--
-- Name: idx_retroactividades_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retroactividades_periodo ON public.retroactividades USING btree (periodo_id, estado);


--
-- Name: idx_retroactividades_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retroactividades_persona ON public.retroactividades USING btree (persona_id);


--
-- Name: idx_schema_migrations_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schema_migrations_estado ON public.schema_migrations USING btree (estado);


--
-- Name: idx_schema_migrations_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schema_migrations_version ON public.schema_migrations USING btree (version);


--
-- Name: idx_tabla_hogar_vigencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tabla_hogar_vigencia ON public.tabla_hogar_constituido USING btree (vigente_desde, hasta_haberes);


--
-- Name: idx_tabla_permanencia_busqueda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tabla_permanencia_busqueda ON public.tabla_permanencia USING btree (escalafon_id, grado_id, aplica_riesgo_vuelo, meses_hasta, vigente_desde);


--
-- Name: idx_tarifas_categoria_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarifas_categoria_lookup ON public.tarifas_por_categoria USING btree (item_id, categoria, vigente_desde);


--
-- Name: ix_acreedores_orden_legal_deficit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_acreedores_orden_legal_deficit ON public.acreedores USING btree (orden_legal_deficit);


--
-- Name: ix_dependientes_persona_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_dependientes_persona_activo ON public.dependientes USING btree (persona_id, activo);


--
-- Name: ix_desc_personal_acreedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_desc_personal_acreedor ON public.descuentos_personal_periodo USING btree (acreedor_id);


--
-- Name: ix_desc_personal_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_desc_personal_periodo ON public.descuentos_personal_periodo USING btree (periodo_id);


--
-- Name: ix_desc_personal_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_desc_personal_persona ON public.descuentos_personal_periodo USING btree (persona_id);


--
-- Name: ix_documentos_tipo_entidad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentos_tipo_entidad ON public.documentos USING btree (tipo, entidad_id);


--
-- Name: ix_form3100_persona; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_form3100_persona ON public.form3100 USING btree (persona_id);


--
-- Name: ix_historico_anio_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_historico_anio_mes ON public.historico_liquidaciones USING btree (anio, mes);


--
-- Name: ix_historico_persona_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_historico_persona_id ON public.historico_liquidaciones USING btree (persona_id);


--
-- Name: ix_lotes_compensacion_periodo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lotes_compensacion_periodo_id ON public.lotes_compensacion USING btree (periodo_id);


--
-- Name: ux_tipos_beneficio_codigo_upper; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_tipos_beneficio_codigo_upper ON public.tipos_beneficio USING btree (upper((codigo)::text));


--
-- Name: personas update_personas_fecha_actualizacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_personas_fecha_actualizacion BEFORE UPDATE ON public.personas FOR EACH ROW EXECUTE FUNCTION public.update_fecha_actualizacion_column();


--
-- Name: relaciones_laborales update_relaciones_laborales_fecha_actualizacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_relaciones_laborales_fecha_actualizacion BEFORE UPDATE ON public.relaciones_laborales FOR EACH ROW EXECUTE FUNCTION public.update_fecha_actualizacion_column();


--
-- Name: usuarios update_usuarios_fecha_actualizacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_usuarios_fecha_actualizacion BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.update_fecha_actualizacion_column();


--
-- Name: aguinaldos aguinaldos_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aguinaldos
    ADD CONSTRAINT aguinaldos_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: beneficio_social_beneficiarios beneficio_social_beneficiarios_beneficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficio_social_beneficiarios
    ADD CONSTRAINT beneficio_social_beneficiarios_beneficio_id_fkey FOREIGN KEY (beneficio_id) REFERENCES public.beneficios_sociales(id) ON DELETE CASCADE;


--
-- Name: beneficio_social_beneficiarios beneficio_social_beneficiarios_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficio_social_beneficiarios
    ADD CONSTRAINT beneficio_social_beneficiarios_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: beneficios_sociales beneficios_sociales_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficios_sociales
    ADD CONSTRAINT beneficios_sociales_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: beneficios_sociales beneficios_sociales_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficios_sociales
    ADD CONSTRAINT beneficios_sociales_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: beneficios_sociales beneficios_sociales_tipo_beneficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficios_sociales
    ADD CONSTRAINT beneficios_sociales_tipo_beneficio_id_fkey FOREIGN KEY (tipo_beneficio_id) REFERENCES public.tipos_beneficio(id);


--
-- Name: bitacora_auditoria bitacora_auditoria_accion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_auditoria
    ADD CONSTRAINT bitacora_auditoria_accion_id_fkey FOREIGN KEY (accion_id) REFERENCES public.acciones(id);


--
-- Name: bitacora_auditoria bitacora_auditoria_contexto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_auditoria
    ADD CONSTRAINT bitacora_auditoria_contexto_id_fkey FOREIGN KEY (contexto_id) REFERENCES public.contextos(id);


--
-- Name: bitacora_auditoria bitacora_auditoria_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bitacora_auditoria
    ADD CONSTRAINT bitacora_auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: catalogo_items catalogo_items_item_par_ficto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogo_items
    ADD CONSTRAINT catalogo_items_item_par_ficto_id_fkey FOREIGN KEY (item_par_ficto_id) REFERENCES public.catalogo_items(id);


--
-- Name: cierres cierres_cerrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres
    ADD CONSTRAINT cierres_cerrado_por_fkey FOREIGN KEY (cerrado_por) REFERENCES public.usuarios(id);


--
-- Name: cierres cierres_liquidacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cierres
    ADD CONSTRAINT cierres_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones(id);


--
-- Name: compensaciones_diferencia_ascenso compensaciones_diferencia_ascens_relacion_laboral_nueva_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compensaciones_diferencia_ascenso
    ADD CONSTRAINT compensaciones_diferencia_ascens_relacion_laboral_nueva_id_fkey FOREIGN KEY (relacion_laboral_nueva_id) REFERENCES public.relaciones_laborales(id);


--
-- Name: compensaciones_diferencia_ascenso compensaciones_diferencia_ascenso_grado_nuevo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compensaciones_diferencia_ascenso
    ADD CONSTRAINT compensaciones_diferencia_ascenso_grado_nuevo_id_fkey FOREIGN KEY (grado_nuevo_id) REFERENCES public.grados(id);


--
-- Name: compensaciones_diferencia_ascenso compensaciones_diferencia_ascenso_grado_viejo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compensaciones_diferencia_ascenso
    ADD CONSTRAINT compensaciones_diferencia_ascenso_grado_viejo_id_fkey FOREIGN KEY (grado_viejo_id) REFERENCES public.grados(id);


--
-- Name: compensaciones_diferencia_ascenso compensaciones_diferencia_ascenso_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compensaciones_diferencia_ascenso
    ADD CONSTRAINT compensaciones_diferencia_ascenso_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id);


--
-- Name: compensaciones_diferencia_ascenso compensaciones_diferencia_ascenso_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compensaciones_diferencia_ascenso
    ADD CONSTRAINT compensaciones_diferencia_ascenso_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: config_compensaciones config_compensaciones_escalafon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_compensaciones
    ADD CONSTRAINT config_compensaciones_escalafon_id_fkey FOREIGN KEY (escalafon_id) REFERENCES public.escalafones(id);


--
-- Name: config_compensaciones config_compensaciones_grado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_compensaciones
    ADD CONSTRAINT config_compensaciones_grado_id_fkey FOREIGN KEY (grado_id) REFERENCES public.grados(id);


--
-- Name: config_compensaciones config_compensaciones_regimen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_compensaciones
    ADD CONSTRAINT config_compensaciones_regimen_id_fkey FOREIGN KEY (regimen_id) REFERENCES public.regimenes(id);


--
-- Name: config_compensaciones config_compensaciones_tipo_compensacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_compensaciones
    ADD CONSTRAINT config_compensaciones_tipo_compensacion_id_fkey FOREIGN KEY (tipo_compensacion_id) REFERENCES public.tipos_compensacion(id);


--
-- Name: cuentas_bancarias cuentas_bancarias_banco_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_bancarias
    ADD CONSTRAINT cuentas_bancarias_banco_id_fkey FOREIGN KEY (banco_id) REFERENCES public.bancos(id);


--
-- Name: cuentas_bancarias cuentas_bancarias_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuentas_bancarias
    ADD CONSTRAINT cuentas_bancarias_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: dependientes dependientes_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dependientes
    ADD CONSTRAINT dependientes_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: descuentos_personal_periodo descuentos_personal_periodo_catalogo_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personal_periodo
    ADD CONSTRAINT descuentos_personal_periodo_catalogo_item_id_fkey FOREIGN KEY (catalogo_item_id) REFERENCES public.catalogo_items(id);


--
-- Name: descuentos_personal_periodo descuentos_personal_periodo_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personal_periodo
    ADD CONSTRAINT descuentos_personal_periodo_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id);


--
-- Name: descuentos_personal_periodo descuentos_personal_periodo_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personal_periodo
    ADD CONSTRAINT descuentos_personal_periodo_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: descuentos_personal_periodo descuentos_personal_periodo_usuario_creacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personal_periodo
    ADD CONSTRAINT descuentos_personal_periodo_usuario_creacion_id_fkey FOREIGN KEY (usuario_creacion_id) REFERENCES public.usuarios(id);


--
-- Name: descuentos_personales descuentos_personales_acreedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personales
    ADD CONSTRAINT descuentos_personales_acreedor_id_fkey FOREIGN KEY (acreedor_id) REFERENCES public.acreedores(id);


--
-- Name: descuentos_personales descuentos_personales_liquidacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personales
    ADD CONSTRAINT descuentos_personales_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones(id);


--
-- Name: descuentos_personales descuentos_personales_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personales
    ADD CONSTRAINT descuentos_personales_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: documentos documentos_usuario_carga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_usuario_carga_id_fkey FOREIGN KEY (usuario_carga_id) REFERENCES public.usuarios(id);


--
-- Name: descuentos_personal_periodo fk_descuentos_personal_periodo_acreedor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_personal_periodo
    ADD CONSTRAINT fk_descuentos_personal_periodo_acreedor FOREIGN KEY (acreedor_id) REFERENCES public.acreedores(id);


--
-- Name: lotes_compensacion fk_lotes_compensacion_periodo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_compensacion
    ADD CONSTRAINT fk_lotes_compensacion_periodo FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id);


--
-- Name: form3100 form3100_documento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100
    ADD CONSTRAINT form3100_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id);


--
-- Name: form3100 form3100_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100
    ADD CONSTRAINT form3100_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: form3100_personas_cargo form3100_personas_cargo_form3100_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100_personas_cargo
    ADD CONSTRAINT form3100_personas_cargo_form3100_id_fkey FOREIGN KEY (form3100_id) REFERENCES public.form3100(id) ON DELETE CASCADE;


--
-- Name: form3100 form3100_usuario_creacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form3100
    ADD CONSTRAINT form3100_usuario_creacion_id_fkey FOREIGN KEY (usuario_creacion_id) REFERENCES public.usuarios(id);


--
-- Name: grados grados_escalafon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grados
    ADD CONSTRAINT grados_escalafon_id_fkey FOREIGN KEY (escalafon_id) REFERENCES public.escalafones(id) ON DELETE SET NULL;


--
-- Name: historico_liquidaciones historico_liquidaciones_escalafon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT historico_liquidaciones_escalafon_id_fkey FOREIGN KEY (escalafon_id) REFERENCES public.escalafones(id);


--
-- Name: historico_liquidaciones historico_liquidaciones_grado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT historico_liquidaciones_grado_id_fkey FOREIGN KEY (grado_id) REFERENCES public.grados(id);


--
-- Name: historico_liquidaciones historico_liquidaciones_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT historico_liquidaciones_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: historico_liquidaciones historico_liquidaciones_programa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT historico_liquidaciones_programa_id_fkey FOREIGN KEY (programa_id) REFERENCES public.programas(id);


--
-- Name: historico_liquidaciones historico_liquidaciones_regimen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT historico_liquidaciones_regimen_id_fkey FOREIGN KEY (regimen_id) REFERENCES public.regimenes(id);


--
-- Name: historico_liquidaciones historico_liquidaciones_situacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT historico_liquidaciones_situacion_id_fkey FOREIGN KEY (situacion_id) REFERENCES public.situaciones(id);


--
-- Name: historico_liquidaciones historico_liquidaciones_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_liquidaciones
    ADD CONSTRAINT historico_liquidaciones_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.unidades(id);


--
-- Name: incidencias_calculo incidencias_calculo_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias_calculo
    ADD CONSTRAINT incidencias_calculo_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id);


--
-- Name: incidencias_calculo incidencias_calculo_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidencias_calculo
    ADD CONSTRAINT incidencias_calculo_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: irpf_detalle_franjas irpf_detalle_franjas_franja_irpf_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_detalle_franjas
    ADD CONSTRAINT irpf_detalle_franjas_franja_irpf_id_fkey FOREIGN KEY (franja_irpf_id) REFERENCES public.franjas_irpf(id);


--
-- Name: irpf_detalle_franjas irpf_detalle_franjas_irpf_mensual_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_detalle_franjas
    ADD CONSTRAINT irpf_detalle_franjas_irpf_mensual_id_fkey FOREIGN KEY (irpf_mensual_id) REFERENCES public.irpf_mensual(id);


--
-- Name: irpf_mensual irpf_mensual_liquidacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_mensual
    ADD CONSTRAINT irpf_mensual_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES public.periodos_liquidacion(id) ON DELETE CASCADE;


--
-- Name: irpf_mensual irpf_mensual_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.irpf_mensual
    ADD CONSTRAINT irpf_mensual_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: items_aguinaldo_baja items_aguinaldo_baja_aguinaldo_baja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_aguinaldo_baja
    ADD CONSTRAINT items_aguinaldo_baja_aguinaldo_baja_id_fkey FOREIGN KEY (aguinaldo_baja_id) REFERENCES public.aguinaldo_baja(id) ON DELETE CASCADE;


--
-- Name: items_liquidacion items_liquidacion_catalogo_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_liquidacion
    ADD CONSTRAINT items_liquidacion_catalogo_item_id_fkey FOREIGN KEY (catalogo_item_id) REFERENCES public.catalogo_items(id);


--
-- Name: items_liquidacion items_liquidacion_liquidacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_liquidacion
    ADD CONSTRAINT items_liquidacion_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones(id);


--
-- Name: items_liquidacion items_liquidacion_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_liquidacion
    ADD CONSTRAINT items_liquidacion_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: items_liquidacion items_liquidacion_relacion_laboral_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_liquidacion
    ADD CONSTRAINT items_liquidacion_relacion_laboral_id_fkey FOREIGN KEY (relacion_laboral_id) REFERENCES public.relaciones_laborales(id);


--
-- Name: items_lote_compensacion items_lote_compensacion_lote_compensacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_lote_compensacion
    ADD CONSTRAINT items_lote_compensacion_lote_compensacion_id_fkey FOREIGN KEY (lote_compensacion_id) REFERENCES public.lotes_compensacion(id);


--
-- Name: items_lote_compensacion items_lote_compensacion_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_lote_compensacion
    ADD CONSTRAINT items_lote_compensacion_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: items_lote_compensacion items_lote_compensacion_snapshot_grado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_lote_compensacion
    ADD CONSTRAINT items_lote_compensacion_snapshot_grado_id_fkey FOREIGN KEY (snapshot_grado_id) REFERENCES public.grados(id);


--
-- Name: items_lote_compensacion items_lote_compensacion_snapshot_programa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_lote_compensacion
    ADD CONSTRAINT items_lote_compensacion_snapshot_programa_id_fkey FOREIGN KEY (snapshot_programa_id) REFERENCES public.programas(id);


--
-- Name: items_lote_compensacion items_lote_compensacion_snapshot_situacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_lote_compensacion
    ADD CONSTRAINT items_lote_compensacion_snapshot_situacion_id_fkey FOREIGN KEY (snapshot_situacion_id) REFERENCES public.situaciones(id);


--
-- Name: items_lote_compensacion items_lote_compensacion_snapshot_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items_lote_compensacion
    ADD CONSTRAINT items_lote_compensacion_snapshot_unidad_id_fkey FOREIGN KEY (snapshot_unidad_id) REFERENCES public.unidades(id);


--
-- Name: liquidacion_estados_personal liquidacion_estados_personal_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_estados_personal
    ADD CONSTRAINT liquidacion_estados_personal_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id) ON DELETE CASCADE;


--
-- Name: liquidacion_items liquidacion_items_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_items
    ADD CONSTRAINT liquidacion_items_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id) ON DELETE CASCADE;


--
-- Name: liquidacion_resumenes liquidacion_resumenes_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidacion_resumenes
    ADD CONSTRAINT liquidacion_resumenes_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id) ON DELETE CASCADE;


--
-- Name: liquidaciones liquidaciones_abierta_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_abierta_por_fkey FOREIGN KEY (abierta_por) REFERENCES public.usuarios(id);


--
-- Name: liquidaciones liquidaciones_cerrada_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_cerrada_por_fkey FOREIGN KEY (cerrada_por) REFERENCES public.usuarios(id);


--
-- Name: liquidaciones liquidaciones_parametros_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidaciones
    ADD CONSTRAINT liquidaciones_parametros_periodo_id_fkey FOREIGN KEY (parametros_periodo_id) REFERENCES public.parametros_periodo(id);


--
-- Name: lotes_compensacion lotes_compensacion_aprobado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_compensacion
    ADD CONSTRAINT lotes_compensacion_aprobado_por_fkey FOREIGN KEY (aprobado_por) REFERENCES public.usuarios(id);


--
-- Name: lotes_compensacion lotes_compensacion_tipo_compensacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_compensacion
    ADD CONSTRAINT lotes_compensacion_tipo_compensacion_id_fkey FOREIGN KEY (tipo_compensacion_id) REFERENCES public.tipos_compensacion(id);


--
-- Name: lotes_compensacion lotes_compensacion_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes_compensacion
    ADD CONSTRAINT lotes_compensacion_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: movimientos_laborales movimientos_laborales_relacion_laboral_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_laborales
    ADD CONSTRAINT movimientos_laborales_relacion_laboral_id_fkey FOREIGN KEY (relacion_laboral_id) REFERENCES public.relaciones_laborales(id);


--
-- Name: movimientos_laborales movimientos_laborales_tipo_movimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_laborales
    ADD CONSTRAINT movimientos_laborales_tipo_movimiento_id_fkey FOREIGN KEY (tipo_movimiento_id) REFERENCES public.tipos_movimiento(id);


--
-- Name: movimientos_laborales movimientos_laborales_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_laborales
    ADD CONSTRAINT movimientos_laborales_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: novedades_periodo novedades_periodo_confirmado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_periodo
    ADD CONSTRAINT novedades_periodo_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES public.usuarios(id);


--
-- Name: novedades_periodo novedades_periodo_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_periodo
    ADD CONSTRAINT novedades_periodo_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: novedades_periodo novedades_periodo_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_periodo
    ADD CONSTRAINT novedades_periodo_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id) ON DELETE CASCADE;


--
-- Name: novedades_periodo novedades_periodo_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades_periodo
    ADD CONSTRAINT novedades_periodo_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: parametros_periodo parametros_periodo_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_periodo
    ADD CONSTRAINT parametros_periodo_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: periodos_liquidacion periodos_liquidacion_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_liquidacion
    ADD CONSTRAINT periodos_liquidacion_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.snapshots_insumos(id) ON DELETE RESTRICT;


--
-- Name: periodos_liquidacion periodos_liquidacion_usuario_apertura_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_liquidacion
    ADD CONSTRAINT periodos_liquidacion_usuario_apertura_fkey FOREIGN KEY (usuario_apertura) REFERENCES public.usuarios(id);


--
-- Name: periodos_liquidacion periodos_liquidacion_usuario_calculo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_liquidacion
    ADD CONSTRAINT periodos_liquidacion_usuario_calculo_fkey FOREIGN KEY (usuario_calculo) REFERENCES public.usuarios(id);


--
-- Name: periodos_liquidacion periodos_liquidacion_usuario_cierre_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_liquidacion
    ADD CONSTRAINT periodos_liquidacion_usuario_cierre_fkey FOREIGN KEY (usuario_cierre) REFERENCES public.usuarios(id);


--
-- Name: periodos_liquidacion periodos_liquidacion_usuario_cierre_insumos_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.periodos_liquidacion
    ADD CONSTRAINT periodos_liquidacion_usuario_cierre_insumos_fkey FOREIGN KEY (usuario_cierre_insumos) REFERENCES public.usuarios(id);


--
-- Name: reglas_ascenso reglas_ascenso_grado_destino_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_ascenso
    ADD CONSTRAINT reglas_ascenso_grado_destino_id_fkey FOREIGN KEY (grado_destino_id) REFERENCES public.grados(id);


--
-- Name: reglas_ascenso reglas_ascenso_grado_origen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reglas_ascenso
    ADD CONSTRAINT reglas_ascenso_grado_origen_id_fkey FOREIGN KEY (grado_origen_id) REFERENCES public.grados(id);


--
-- Name: relaciones_laborales relaciones_laborales_escalafon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_escalafon_id_fkey FOREIGN KEY (escalafon_id) REFERENCES public.escalafones(id);


--
-- Name: relaciones_laborales relaciones_laborales_grado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_grado_id_fkey FOREIGN KEY (grado_id) REFERENCES public.grados(id);


--
-- Name: relaciones_laborales relaciones_laborales_grado_reincorporacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_grado_reincorporacion_id_fkey FOREIGN KEY (grado_reincorporacion_id) REFERENCES public.grados(id);


--
-- Name: relaciones_laborales relaciones_laborales_motivo_baja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_motivo_baja_id_fkey FOREIGN KEY (motivo_baja_id) REFERENCES public.motivos_baja(id);


--
-- Name: relaciones_laborales relaciones_laborales_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: relaciones_laborales relaciones_laborales_programa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_programa_id_fkey FOREIGN KEY (programa_id) REFERENCES public.programas(id);


--
-- Name: relaciones_laborales relaciones_laborales_regimen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_regimen_id_fkey FOREIGN KEY (regimen_id) REFERENCES public.regimenes(id);


--
-- Name: relaciones_laborales relaciones_laborales_situacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_situacion_id_fkey FOREIGN KEY (situacion_id) REFERENCES public.situaciones(id);


--
-- Name: relaciones_laborales relaciones_laborales_sub_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_sub_unidad_id_fkey FOREIGN KEY (sub_unidad_id) REFERENCES public.sub_unidades(id);


--
-- Name: relaciones_laborales relaciones_laborales_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_laborales
    ADD CONSTRAINT relaciones_laborales_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.unidades(id);


--
-- Name: remuneraciones_grado remuneraciones_grado_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remuneraciones_grado
    ADD CONSTRAINT remuneraciones_grado_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: remuneraciones_grado remuneraciones_grado_grado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remuneraciones_grado
    ADD CONSTRAINT remuneraciones_grado_grado_id_fkey FOREIGN KEY (grado_id) REFERENCES public.grados(id);


--
-- Name: remuneraciones_grado remuneraciones_grado_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remuneraciones_grado
    ADD CONSTRAINT remuneraciones_grado_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.catalogo_items(id);


--
-- Name: retroactividad_items retroactividad_items_retroactividad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividad_items
    ADD CONSTRAINT retroactividad_items_retroactividad_id_fkey FOREIGN KEY (retroactividad_id) REFERENCES public.retroactividades(id) ON DELETE CASCADE;


--
-- Name: retroactividades retroactividades_confirmado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividades
    ADD CONSTRAINT retroactividades_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES public.usuarios(id);


--
-- Name: retroactividades retroactividades_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividades
    ADD CONSTRAINT retroactividades_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);


--
-- Name: retroactividades retroactividades_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividades
    ADD CONSTRAINT retroactividades_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos_liquidacion(id);


--
-- Name: retroactividades retroactividades_periodo_referencia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividades
    ADD CONSTRAINT retroactividades_periodo_referencia_id_fkey FOREIGN KEY (periodo_referencia_id) REFERENCES public.periodos_liquidacion(id);


--
-- Name: retroactividades retroactividades_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retroactividades
    ADD CONSTRAINT retroactividades_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: sub_unidades sub_unidades_unidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_unidades
    ADD CONSTRAINT sub_unidades_unidad_id_fkey FOREIGN KEY (unidad_id) REFERENCES public.unidades(id);


--
-- Name: tabla_permanencia tabla_permanencia_escalafon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabla_permanencia
    ADD CONSTRAINT tabla_permanencia_escalafon_id_fkey FOREIGN KEY (escalafon_id) REFERENCES public.escalafones(id);


--
-- Name: tabla_permanencia tabla_permanencia_grado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tabla_permanencia
    ADD CONSTRAINT tabla_permanencia_grado_id_fkey FOREIGN KEY (grado_id) REFERENCES public.grados(id);


--
-- Name: tarifas_por_categoria tarifas_por_categoria_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas_por_categoria
    ADD CONSTRAINT tarifas_por_categoria_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.catalogo_items(id);


--
-- Name: tipos_beneficio tipos_beneficio_catalogo_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_beneficio
    ADD CONSTRAINT tipos_beneficio_catalogo_item_id_fkey FOREIGN KEY (catalogo_item_id) REFERENCES public.catalogo_items(id);


--
-- Name: usuarios usuarios_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id);


--
-- Name: usuarios_roles usuarios_roles_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id);


--
-- Name: usuarios_roles usuarios_roles_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios_roles
    ADD CONSTRAINT usuarios_roles_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Migrations (integrated from scripts/migrations/)
-- All data changes have been applied directly to the COPY sections above.
--


--
-- PostgreSQL database dump complete
--

\unrestrict zB8hiFFMQzsMa4AlfweIdjCMOgqIKcQ6txoLxxKzH8d8juxGcpnP7hHVDNav0Cc


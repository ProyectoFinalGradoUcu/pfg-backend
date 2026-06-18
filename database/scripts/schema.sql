--
-- PostgreSQL database dump
--

\restrict JtbBt88e9kc0eeacEo0jKnRuai7kibvxqafEAcmu3489gkhHe33KwOmFyWyFXcj

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
    CONSTRAINT acreedores_formato_archivo_check CHECK (((formato_archivo)::text = ANY ((ARRAY['txt'::character varying, 'csv'::character varying, 'xlsx'::character varying])::text[]))),
    CONSTRAINT ck_acreedores_categoria_deficit CHECK (((categoria_deficit)::text = ANY ((ARRAY['retencion_judicial_alimenticia'::character varying, 'garantia_alquiler'::character varying, 'cuota_sindical_partido'::character varying, 'credito_social_brou'::character varying, 'vivienda'::character varying, 'seguro_vida'::character varying, 'salud_prepaga'::character varying, 'credito_nomina_cooperativa'::character varying, 'facilidad_pago_tributaria'::character varying, 'otras_retenciones'::character varying])::text[])))
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
    liquidacion_id bigint,
    CONSTRAINT aguinaldos_meses_trabajados_check CHECK (((meses_trabajados >= 0) AND (meses_trabajados <= 6))),
    CONSTRAINT aguinaldos_semestre_check CHECK ((semestre = ANY (ARRAY[1, 2])))
);


--
-- Name: TABLE aguinaldos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.aguinaldos IS 'SAC semestral por persona. Monto = total_haberes_gravados_semestre / 12 (equiv. AGUINALD.DBF)';


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
    CONSTRAINT beneficios_sociales_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'inactivo'::character varying, 'pendiente_doc'::character varying])::text[])))
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
    detalle jsonb
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
    vigente boolean DEFAULT true NOT NULL,
    norma_legal character varying(100),
    acumula_aguinaldo boolean DEFAULT false NOT NULL,
    lleva_aumento boolean DEFAULT false NOT NULL,
    CONSTRAINT catalogo_items_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['haber_normal'::character varying, 'haber_anual'::character varying, 'haber_no_gravado'::character varying, 'beneficio_social_grav'::character varying, 'beneficio_social_no_grav'::character varying, 'descuento_legal'::character varying, 'descuento_personal'::character varying, 'ficto_haber'::character varying, 'ficto_descuento'::character varying])::text[])))
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
    CONSTRAINT cierres_estado_check CHECK (((estado)::text = ANY ((ARRAY['en_proceso'::character varying, 'completado'::character varying, 'fallido'::character varying])::text[]))),
    CONSTRAINT cierres_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['mensual'::character varying, 'semestral'::character varying, 'anual'::character varying])::text[])))
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
    CONSTRAINT compensaciones_diferencia_ascenso_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'aplicado'::character varying, 'anulado'::character varying])::text[])))
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
    CONSTRAINT config_compensaciones_formula_check CHECK (((formula)::text = ANY ((ARRAY['fijo'::character varying, 'tabla'::character varying, 'prorrateo'::character varying, 'presupuesto'::character varying, 'rango'::character varying])::text[]))),
    CONSTRAINT config_compensaciones_unidad_medida_check CHECK (((unidad_medida)::text = ANY ((ARRAY['dia'::character varying, 'hora'::character varying, 'monto'::character varying])::text[])))
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
    CONSTRAINT cuentas_bancarias_estado_check CHECK (((estado)::text = ANY ((ARRAY['activa'::character varying, 'inactiva'::character varying])::text[])))
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
    CONSTRAINT dependientes_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['hijo'::character varying, 'conyuge_sin_ingresos'::character varying])::text[])))
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
    CONSTRAINT descuentos_personal_periodo_estado_check CHECK (((estado)::text = ANY ((ARRAY['borrador'::character varying, 'confirmado'::character varying])::text[]))),
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
    CONSTRAINT descuentos_personales_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'aplicado'::character varying, 'parcial'::character varying, 'rechazado'::character varying, 'no_revista'::character varying, 'deficit'::character varying, 'anulado'::character varying])::text[]))),
    CONSTRAINT descuentos_personales_monto_solicitado_check CHECK ((monto_solicitado > (0)::numeric)),
    CONSTRAINT descuentos_personales_periodo_mes_check CHECK (((periodo_mes >= 1) AND (periodo_mes <= 12))),
    CONSTRAINT descuentos_personales_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['eventual'::character varying, 'permanente'::character varying])::text[])))
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
    CONSTRAINT form3100_cappu_categoria_check CHECK (((cappu_categoria >= 1) AND (cappu_categoria <= 10))),
    CONSTRAINT form3100_conyuge_sexo_check CHECK (((conyuge_sexo)::text = ANY ((ARRAY['M'::character varying, 'F'::character varying])::text[]))),
    CONSTRAINT form3100_fondo_solidaridad_check CHECK (((fondo_solidaridad)::text = ANY ((ARRAY['0.5_BPC'::character varying, '1_BPC'::character varying, '2_BPC'::character varying])::text[]))),
    CONSTRAINT form3100_vigente_desde_anio_check CHECK ((vigente_desde_anio > 2000)),
    CONSTRAINT form3100_vigente_desde_mes_check CHECK (((vigente_desde_mes >= 1) AND (vigente_desde_mes <= 12)))
);


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
    CONSTRAINT form3100_personas_cargo_sexo_check CHECK (((sexo)::text = ANY ((ARRAY['M'::character varying, 'F'::character varying])::text[])))
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
    CONSTRAINT ck_incidencias_calculo_tipo CHECK (((tipo)::text = ANY ((ARRAY['BeneficioYaPagado'::character varying, 'BeneficioRetroactivoPendiente'::character varying, 'TipoBeneficioDesconocido'::character varying, 'SubtipoPsfDesconocido'::character varying, 'ErrorCalculo'::character varying, 'InstructivoNoConfigurado'::character varying, 'CalculoSimplificado'::character varying, 'CatalogoItemNoConfigurado'::character varying])::text[])))
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
    CONSTRAINT ck_instructivo_asig_familiar_tipo CHECK (((tipo_franja)::text = ANY ((ARRAY['franja_8'::character varying, 'franja_16'::character varying, 'discapacidad'::character varying])::text[])))
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
    CONSTRAINT items_liquidacion_estado_check CHECK (((estado)::text = ANY ((ARRAY['calculado'::character varying, 'revisar'::character varying, 'error'::character varying, 'ajustado'::character varying, 'no_cobro'::character varying])::text[])))
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
    CONSTRAINT items_lote_compensacion_ala_check CHECK (((ala IS NULL) OR ((ala)::text = ANY ((ARRAY['A'::character varying, 'N'::character varying, 'S'::character varying])::text[])))),
    CONSTRAINT items_lote_compensacion_estado_check CHECK (((estado)::text = ANY ((ARRAY['ok'::character varying, 'verificar'::character varying, 'error'::character varying])::text[])))
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
    CONSTRAINT liquidaciones_estado_check CHECK (((estado)::text = ANY ((ARRAY['abierta'::character varying, 'en_calculo'::character varying, 'calculada'::character varying, 'en_revision'::character varying, 'cerrada'::character varying])::text[]))),
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
    periodo date NOT NULL,
    estado character varying(20) DEFAULT 'borrador'::character varying NOT NULL,
    fuente character varying(150),
    nombre_archivo character varying(200),
    hash_archivo character varying(100),
    usuario_id bigint NOT NULL,
    creado_en timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    aprobado_por bigint,
    aprobado_en timestamp without time zone,
    CONSTRAINT lotes_compensacion_estado_check CHECK (((estado)::text = ANY ((ARRAY['borrador'::character varying, 'validado'::character varying, 'aprobado'::character varying, 'exportado'::character varying, 'rechazado'::character varying])::text[])))
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
    CONSTRAINT novedades_periodo_estado_check CHECK (((estado)::text = ANY ((ARRAY['borrador'::character varying, 'confirmada'::character varying, 'anulada'::character varying])::text[]))),
    CONSTRAINT novedades_periodo_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['dias_eximidos'::character varying, 'retiro_parcial'::character varying, 'subsidio_enfermedad'::character varying])::text[])))
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
    CONSTRAINT periodos_liquidacion_estado_check CHECK (((estado)::text = ANY ((ARRAY['ABIERTA'::character varying, 'LISTA_CALCULO'::character varying, 'EN_CALCULO'::character varying, 'CALCULADA'::character varying, 'CERRADA'::character varying])::text[]))),
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
-- Name: permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permisos (
    id bigint NOT NULL,
    nombre character varying(60) NOT NULL,
    descripcion character varying(200)
);


--
-- Name: permisos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permisos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permisos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permisos_id_seq OWNED BY public.permisos.id;


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
    fecha_ascenso_oficial date,
    superprima boolean DEFAULT false NOT NULL,
    CONSTRAINT relaciones_laborales_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'inactivo'::character varying])::text[])))
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
    CONSTRAINT retroactividades_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'confirmada'::character varying, 'calculada'::character varying, 'aplicada'::character varying, 'anulada'::character varying])::text[]))),
    CONSTRAINT retroactividades_meses_retro_check CHECK ((meses_retro > 0)),
    CONSTRAINT retroactividades_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['haberes'::character varying, 'beneficios'::character varying, 'prima_tecnica'::character varying, 'super_prima'::character varying])::text[])))
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
-- Name: roles_permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles_permisos (
    permiso_id bigint NOT NULL,
    rol_id bigint NOT NULL
);


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
    CONSTRAINT schema_migrations_estado_check CHECK (((estado)::text = ANY ((ARRAY['SUCCESS'::character varying, 'FAILED'::character varying, 'RUNNING'::character varying])::text[])))
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
    CONSTRAINT situaciones_sistema_salud_check CHECK (((sistema_salud)::text = ANY ((ARRAY['ssffaa'::character varying, 'fonasa'::character varying])::text[])))
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
    anios_desde smallint NOT NULL,
    anios_hasta smallint NOT NULL,
    porcentaje numeric(5,4),
    monto_fijo numeric(14,2),
    vigente_desde date NOT NULL,
    vigente_hasta date,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT tabla_permanencia_check CHECK ((anios_hasta >= anios_desde)),
    CONSTRAINT tabla_permanencia_check1 CHECK (((porcentaje IS NOT NULL) OR (monto_fijo IS NOT NULL)))
);


--
-- Name: TABLE tabla_permanencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tabla_permanencia IS 'Porcentaje o monto de antigüedad por rango de años y escalafón (equiv. PERMANEN.DBF)';


--
-- Name: COLUMN tabla_permanencia.activo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tabla_permanencia.activo IS 'Indica si el rango de permanencia está activo (soft delete)';


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
    CONSTRAINT tarifas_por_categoria_tipo_monto_check CHECK (((tipo_monto)::text = ANY ((ARRAY['mensual'::character varying, 'diario'::character varying, 'hora'::character varying, 'por_unidad'::character varying])::text[])))
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
    CONSTRAINT tipos_compensacion_unidad_medida_check CHECK (((unidad_medida)::text = ANY ((ARRAY['dia'::character varying, 'hora'::character varying, 'monto'::character varying])::text[])))
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
    CONSTRAINT usuarios_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'bloqueado'::character varying])::text[])))
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
  WHERE ((estado)::text = ANY ((ARRAY['deficit'::character varying, 'parcial'::character varying])::text[]))
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
            WHEN ((ci.tipo)::text = ANY ((ARRAY['haber_normal'::character varying, 'haber_anual'::character varying, 'haber_no_grabado'::character varying, 'ficto_haber'::character varying])::text[])) THEN il.monto
            ELSE (0)::numeric
        END) AS total_haberes,
    sum(
        CASE
            WHEN ((ci.tipo)::text = ANY ((ARRAY['beneficio_social_grab'::character varying, 'beneficio_social_no_grab'::character varying])::text[])) THEN il.monto
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
-- Name: permisos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos ALTER COLUMN id SET DEFAULT nextval('public.permisos_id_seq'::regclass);


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
-- Name: permisos permisos_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permisos_nombre_key UNIQUE (nombre);


--
-- Name: permisos permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT permisos_pkey PRIMARY KEY (id);


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
-- Name: roles_permisos roles_permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_pkey PRIMARY KEY (permiso_id, rol_id);


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
-- Name: idx_tarifas_categoria_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarifas_categoria_lookup ON public.tarifas_por_categoria USING btree (item_id, categoria, vigente_desde);


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
-- Name: uix_lotes_tipo_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uix_lotes_tipo_periodo ON public.lotes_compensacion USING btree (tipo_compensacion_id, periodo) WHERE ((estado)::text <> 'rechazado'::text);


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
-- Name: aguinaldos aguinaldos_liquidacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aguinaldos
    ADD CONSTRAINT aguinaldos_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES public.liquidaciones(id);


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
-- Name: roles_permisos roles_permisos_permiso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_permiso_id_fkey FOREIGN KEY (permiso_id) REFERENCES public.permisos(id);


--
-- Name: roles_permisos roles_permisos_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles_permisos
    ADD CONSTRAINT roles_permisos_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(id);


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
-- PostgreSQL database dump complete
--

\unrestrict JtbBt88e9kc0eeacEo0jKnRuai7kibvxqafEAcmu3489gkhHe33KwOmFyWyFXcj
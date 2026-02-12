CREATE TABLE [IF NOT EXISTS] Persona (
    ##Datos naturales
    cedula_identidad integer[PRIMARY KEY],
    credencial_civica VARCHAR(10),
    nombre VARCHAR,
    apellido VARCHAR,
    fecha_nacimiento DATE,
    lugar_nacimiento VARCHAR,
    sexo VARCHAR,
    etnia VARCHAR,
    estado_civil ENUM(
        'SOLTERO',
        'CASADO',
        'DIVORCIADO',
        'VIUDO',
        'UNION_LIBRE'
    ),
    email VARCHAR,
    foto VARCHAR,
    direccion_domicilio VARCHAR,
    contacto_telefonico INTEGER,
    ##Datos Militares
    seccional_judicial VARCHAR
    fecha_ingreso DATE,
    fecha_egreso DATE,
    escalafon VARCHAR,
    grado VARCHAR,
    numero_orden_ingreso VARCHAR,
    numero_orden_egreso VARCHAR,
    vivienda_servicio BOOLEAN,
    tipo_persona enum("ALTERNO", "SUBALTERNO", "SUPERVISOR_AEROTECNICO")
);

CREATE TABLE [IF NOT EXISTS] Familiar (
    cedula_identidad integer[PRIMARY KEY],
    cedula_identidad_titular INTEGER,
    tipo_vinculo VARCHAR,
    telefono_contacto INTEGER,
    direccion VARCHAR,
    fecha_fallecimiento DATE,
    seccional_judicial VARCHAR,
    observaciones VARCHAR,
    Foreign Key (cedula_identidad_titular) REFERENCES (Persona)
):

CREATE TABLE [IF NOT EXISTS] Ascenso (
    id_ascenso INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cedula_identidad integer,
    grado_actual VARCHAR,
    grado_ascenso VARCHAR,
    fecha_ascenso DATE,
    tipo_ascenso VARCHAR,
    numero_orden VARCHAR,
    Foreign Key (cedula_identidad) REFERENCES (Persona)
):

CREATE TABLE [IF NOT EXISTS] Curso (
    id_cusro INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_curso VARCHAR,
    grado_actual VARCHAR,
    grado_ascenso VARCHAR,
    fecha_ascenso DATE,
    tipo_ascenso VARCHAR,
    numero_orden VARCHAR,
    Foreign Key (cedula_identidad) REFERENCES (Persona)
):
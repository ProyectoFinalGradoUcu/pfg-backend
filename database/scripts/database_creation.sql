-- Estado civil
CREATE TYPE estado_civil_enum AS ENUM (
    'SOLTERO',
    'CASADO',
    'DIVORCIADO',
    'VIUDO',
    'UNION_LIBRE'
);

-- Tipo de persona militar
CREATE TYPE tipo_persona_enum AS ENUM (
    'ALTERNO',
    'SUBALTERNO',
    'SUPERVISOR_AEROTECNICO'
);

-- Función en vuelo
CREATE TYPE funcion_vuelo_enum AS ENUM (
    'PILOTO',
    'COPILOTO',
    'INSTRUCTOR',
    'OBSERVADOR'
);

CREATE TABLE IF NOT EXISTS Persona (
    cedula_identidad INTEGER PRIMARY KEY,
    credencial_civica VARCHAR(15),
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    lugar_nacimiento VARCHAR(150),
    sexo VARCHAR(20),
    etnia VARCHAR(50),
    estado_civil estado_civil_enum,
    email VARCHAR(150) UNIQUE,
    foto VARCHAR(255),
    direccion_domicilio VARCHAR(255),
    contacto_telefonico VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS PersonaMilitar (
    cedula_identidad INTEGER PRIMARY KEY,
    seccional_judicial VARCHAR(100),
    fecha_ingreso DATE NOT NULL,
    fecha_egreso DATE,
    escalafon VARCHAR(100),
    posicion_escalafon INTEGER,
    grado VARCHAR(100),
    numero_orden_ingreso VARCHAR(50),
    numero_orden_egreso VARCHAR(50),
    vivienda_servicio BOOLEAN DEFAULT FALSE,
    conducta VARCHAR(100),
    tipo_persona tipo_persona_enum,
    FOREIGN KEY (cedula_identidad) REFERENCES Persona (cedula_identidad) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Familiar (
    cedula_identidad INTEGER PRIMARY KEY,
    cedula_identidad_titular INTEGER NOT NULL,
    tipo_vinculo VARCHAR(50) NOT NULL,
    telefono_contacto VARCHAR(20),
    direccion VARCHAR(255),
    fecha_fallecimiento DATE,
    seccional_judicial VARCHAR(100),
    observaciones VARCHAR(255),
    FOREIGN KEY (cedula_identidad_titular) REFERENCES Persona (cedula_identidad) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Ascenso (
    id_ascenso INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cedula_identidad INTEGER NOT NULL,
    grado_actual VARCHAR(100) NOT NULL,
    grado_ascenso VARCHAR(100) NOT NULL,
    fecha_ascenso DATE NOT NULL,
    tipo_ascenso VARCHAR(50),
    numero_orden VARCHAR(50),
    FOREIGN KEY (cedula_identidad) REFERENCES Persona (cedula_identidad) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Institucion (
    id_institucion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    pais VARCHAR(100),
    ciudad VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS Curso (
    id_curso INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_curso VARCHAR(150) NOT NULL,
    id_institucion INTEGER,
    fecha_inicio_curso DATE,
    fecha_fin_curso DATE,
    numero_boletin VARCHAR(50),
    FOREIGN KEY (id_institucion) REFERENCES Institucion (id_institucion) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS PersonaCurso (
    id_curso INTEGER,
    cedula_identidad INTEGER,
    fecha_finalizacion DATE,
    nota INTEGER CHECK (nota BETWEEN 0 AND 100),
    certificado_cumplimiento VARCHAR(255),
    nivel_pericia_alcanzado VARCHAR(100),
    observaciones VARCHAR(255),
    PRIMARY KEY (id_curso, cedula_identidad),
    FOREIGN KEY (id_curso) REFERENCES Curso (id_curso) ON DELETE CASCADE,
    FOREIGN KEY (cedula_identidad) REFERENCES Persona (cedula_identidad) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Mision (
    id_mision INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_mision VARCHAR(150) NOT NULL,
    tipo_mision VARCHAR(100),
    pais_mision VARCHAR(100),
    lugar_mision VARCHAR(150),
    fecha_desde_mision DATE,
    fecha_hasta_mision DATE,
    numero_orden VARCHAR(50),
    numero_boletin VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS PersonaMision (
    id_mision INTEGER,
    cedula_identidad INTEGER,
    fecha_finalizacion DATE,
    observaciones VARCHAR(255),
    PRIMARY KEY (id_mision, cedula_identidad),
    FOREIGN KEY (id_mision) REFERENCES Mision (id_mision) ON DELETE CASCADE,
    FOREIGN KEY (cedula_identidad) REFERENCES Persona (cedula_identidad) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Destino (
    id_destino INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_destino VARCHAR(150) NOT NULL,
    tipo_destino VARCHAR(100),
    lugar VARCHAR(150),
    unidad VARCHAR(150)
);

CREATE TABLE IF NOT EXISTS PersonaDestino (
    id_destino INTEGER,
    cedula_identidad INTEGER,
    numero_orden VARCHAR(50),
    fecha_inicio DATE,
    fecha_fin DATE,
    observaciones VARCHAR(255),
    PRIMARY KEY (id_destino, cedula_identidad),
    FOREIGN KEY (id_destino) REFERENCES Destino (id_destino) ON DELETE CASCADE,
    FOREIGN KEY (cedula_identidad) REFERENCES Persona (cedula_identidad) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS HorasVuelo (
    id_vuelo INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_aeronave VARCHAR(100) NOT NULL,
    funcion funcion_vuelo_enum NOT NULL,
    horas_realizadas INTEGER NOT NULL,
    brevet VARCHAR(50),
    fecha_realizacion DATE NOT NULL,
    cedula_identidad INTEGER NOT NULL,
    FOREIGN KEY (cedula_identidad) REFERENCES Persona (cedula_identidad) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Beneficio (
    id_beneficio INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cedula_identidad INTEGER NOT NULL,
    prima_tecnica VARCHAR(100),
    idoneidad VARCHAR(100),
    meses_asignados INTEGER,
    vivienda_servicio BOOLEAN DEFAULT FALSE,
    observaciones VARCHAR(255),
    FOREIGN KEY (cedula_identidad) REFERENCES Persona (cedula_identidad) ON DELETE CASCADE
);
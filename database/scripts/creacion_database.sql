CREATE TABLE persona (
	persona_id SERIAL PRIMARY KEY,
	identificacion_nacional VARCHAR(50) UNIQUE NOT NULL,
	nombre VARCHAR(100),
	apellido VARCHAR(100),
	fecha_nacimiento DATE,
	lugar_nacimiento VARCHAR(200),
	sexo VARCHAR(20),
	etnia VARCHAR(50),
	estado_civil VARCHAR(50),
	direccion VARCHAR(255),
	codigo_postal VARCHAR(20),
	seccional VARCHAR(100),
	correo_electronico VARCHAR(150),
	foto BYTEA,
	fecha_fallecimiento DATE,
	es_civil BOOLEAN DEFAULT FALSE
);

CREATE TABLE categoria (
	categoria_id SERIAL PRIMARY KEY,
	nombre_categoria VARCHAR(100)
);

CREATE TABLE rango (
	rango_id SERIAL PRIMARY KEY,
	nombre_rango VARCHAR(100)
);

CREATE TABLE categoria_rango (
	categoria_id INTEGER REFERENCES categoria(categoria_id),
	rango_id INTEGER REFERENCES rango(rango_id),
	PRIMARY KEY (categoria_id, rango_id)
);

CREATE TYPE tipo_funcionario_enum AS ENUM ('subalterno', 'oficial');

CREATE TABLE funcionario (
	persona_id INTEGER PRIMARY KEY REFERENCES persona(persona_id) ON DELETE CASCADE,
	categoria_id INTEGER NOT NULL REFERENCES categoria(categoria_id),
	tipo_funcionario tipo_funcionario_enum,
	tiene_mando BOOLEAN,
	posicion_rango INTEGER,
	motivo_baja TEXT,
	fecha_baja DATE,
	mutaciones TEXT,
	conducta TEXT
);

CREATE TABLE mision (
	mision_id SERIAL PRIMARY KEY,
	pais VARCHAR(100),
	tipo_mision VARCHAR(100),
	fecha_salida DATE,
	fecha_llegada DATE,
	numero_orden VARCHAR(50),
	boletin VARCHAR(50),
	observaciones TEXT,
	comando_responsable VARCHAR(200)
);

CREATE TABLE destino (
	destino_id SERIAL PRIMARY KEY,
	ubicacion VARCHAR(200),
	numero_orden VARCHAR(50),
	tipo_destino VARCHAR(100)
);

CREATE TABLE vuelo (
	vuelo_id SERIAL PRIMARY KEY,
	anio INTEGER,
	trimestre INTEGER,
	tipo_aeronave VARCHAR(100),
	modelo_aeronave VARCHAR(100),
	funcion VARCHAR(100),
	horas_vuelo NUMERIC(10, 2),
	horas_vuelo_ficticias NUMERIC(10, 2),
	horas_totales NUMERIC(10, 2),
	tipo_licencia VARCHAR(100),
	fecha_licencia DATE
);

CREATE TABLE curso (
	curso_id SERIAL PRIMARY KEY,
	nombre_curso VARCHAR(200),
	institucion VARCHAR(200),
	fecha_inicio DATE,
	fecha_fin DATE,
	boletin VARCHAR(50),
	numero_orden VARCHAR(50)
);

CREATE TABLE vivienda_servicio (
	vivienda_id SERIAL PRIMARY KEY,
	direccion VARCHAR(255)
);

CREATE TABLE retiro (
	retiro_id SERIAL PRIMARY KEY,
	persona_id INTEGER UNIQUE REFERENCES funcionario(persona_id),
	fecha_retiro DATE,
	hora_retiro TIME,
	motivo TEXT
);

CREATE TABLE relacion_familiar (
	persona_id INTEGER REFERENCES persona(persona_id),
	familiar_id INTEGER REFERENCES persona(persona_id),
	tipo_relacion VARCHAR(50),
	observaciones TEXT,
	PRIMARY KEY (persona_id, familiar_id)
);

CREATE TABLE asignacion_funcionario (
	asignacion_id SERIAL PRIMARY KEY,
	persona_id INTEGER REFERENCES funcionario(persona_id),
	destino_id INTEGER REFERENCES destino(destino_id),
	fecha_inicio DATE,
	fecha_fin DATE,
	observaciones TEXT
);

CREATE TABLE funcionario_mision (
	persona_id INTEGER REFERENCES funcionario(persona_id),
	mision_id INTEGER REFERENCES mision(mision_id),
	PRIMARY KEY (persona_id, mision_id)
);

CREATE TABLE funcionario_vuelo (
	persona_id INTEGER REFERENCES funcionario(persona_id),
	vuelo_id INTEGER REFERENCES vuelo(vuelo_id),
	PRIMARY KEY (persona_id, vuelo_id)
);

CREATE TABLE funcionario_curso (
	persona_id INTEGER REFERENCES funcionario(persona_id),
	curso_id INTEGER REFERENCES curso(curso_id),
	PRIMARY KEY (persona_id, curso_id)
);

CREATE TABLE ascenso (
	ascenso_id SERIAL PRIMARY KEY,
	persona_id INTEGER REFERENCES funcionario(persona_id),
	categoria_id INTEGER,
	rango_id INTEGER,
	fecha_ascenso DATE,
	observaciones TEXT,
	FOREIGN KEY (categoria_id, rango_id)
		REFERENCES categoria_rango(categoria_id, rango_id)
);

CREATE TABLE ocupacion_vivienda (
	persona_id INTEGER REFERENCES persona(persona_id),
	vivienda_id INTEGER REFERENCES vivienda_servicio(vivienda_id),
	fecha_inicio DATE NOT NULL,
	fecha_fin DATE,
	PRIMARY KEY (persona_id, vivienda_id)
);
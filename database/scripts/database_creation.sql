CREATE TABLE person (
    person_id SERIAL PRIMARY KEY,
    national_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    birth_date DATE,
    birth_place VARCHAR(200),
    gender VARCHAR(20),
    ethnicity VARCHAR(50),
    marital_status VARCHAR(50),
    address VARCHAR(255),
    postal_code VARCHAR(20),
    sectional VARCHAR(100),
    email VARCHAR(150),
    photo BYTEA,
    death_date DATE,
    is_civil BOOLEAN DEFAULT FALSE
);

CREATE TABLE category (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100)
);

CREATE TABLE rank (
    rank_id SERIAL PRIMARY KEY,
    rank_name VARCHAR(100)
);

CREATE TABLE category_rank (
    category_id INTEGER REFERENCES category(category_id),
    rank_id INTEGER REFERENCES rank(rank_id),
    PRIMARY KEY (category_id, rank_id)
);

CREATE TYPE staff_type_enum AS ENUM ('subaltern', 'official');

CREATE TABLE staff (
    person_id INTEGER PRIMARY KEY REFERENCES person(person_id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES category(category_id),
    staff_type staff_type_enum,
    command_right BOOLEAN,
    rank_position INTEGER,
    discharge_reason TEXT,
    discharge_date DATE,
    mutations TEXT,
    conduct TEXT
);

CREATE TABLE mission (
    mission_id SERIAL PRIMARY KEY,
    country VARCHAR(100),
    mission_type VARCHAR(100),
    departure_date DATE,
    arrival_date DATE,
    order_number VARCHAR(50),
    bulletin VARCHAR(50),
    observations TEXT,
    responsible_command VARCHAR(200)
);

CREATE TABLE destination (
    destination_id SERIAL PRIMARY KEY,
    location VARCHAR(200),
    order_number VARCHAR(50),
    destination_type VARCHAR(100)
);

CREATE TABLE flight (
    flight_id SERIAL PRIMARY KEY,
    year INTEGER,
    quarter INTEGER,
    aircraft_type VARCHAR(100),
    aircraft_model VARCHAR(100),
    function VARCHAR(100),
    flight_hours NUMERIC(10, 2),
    fictional_flight_hours NUMERIC(10, 2),
    total_hours NUMERIC(10, 2),
    license_type VARCHAR(100),
    license_date DATE
);

CREATE TABLE course (
    course_id SERIAL PRIMARY KEY,
    course_name VARCHAR(200),
    institution VARCHAR(200),
    start_date DATE,
    end_date DATE,
    bulletin VARCHAR(50),
    order_number VARCHAR(50)
);

CREATE TABLE service_housing (
    housing_id SERIAL PRIMARY KEY,
    address VARCHAR(255)
);

CREATE TABLE retirement (
    retirement_id SERIAL PRIMARY KEY,
    person_id INTEGER UNIQUE REFERENCES staff(person_id),
    retirement_date DATE,
    retirement_time TIME,
    reason TEXT
);

CREATE TABLE family_relation (
    person_id INTEGER REFERENCES person(person_id),
    relative_id INTEGER REFERENCES person(person_id),
    relation_type VARCHAR(50),
    observations TEXT,
    PRIMARY KEY (person_id, relative_id)
);

CREATE TABLE staff_assignment (
    assignment_id SERIAL PRIMARY KEY,
    person_id INTEGER REFERENCES staff(person_id),
    destination_id INTEGER REFERENCES destination(destination_id),
    start_date DATE,
    end_date DATE,
    observations TEXT
);

CREATE TABLE staff_mission (
    person_id INTEGER REFERENCES staff(person_id),
    mission_id INTEGER REFERENCES mission(mission_id),
    PRIMARY KEY (person_id, mission_id)
);

CREATE TABLE staff_flight (
    person_id INTEGER REFERENCES staff(person_id),
    flight_id INTEGER REFERENCES flight(flight_id),
    PRIMARY KEY (person_id, flight_id)
);

CREATE TABLE staff_course (
    person_id INTEGER REFERENCES staff(person_id),
    course_id INTEGER REFERENCES course(course_id),
    PRIMARY KEY (person_id, course_id)
);

CREATE TABLE promotion (
    promotion_id SERIAL PRIMARY KEY,
    person_id INTEGER REFERENCES staff(person_id),
    category_id INTEGER,
    rank_id INTEGER,
    promotion_date DATE,
    observations TEXT,
    FOREIGN KEY (category_id, rank_id) 
        REFERENCES category_rank(category_id, rank_id)
);

CREATE TABLE housing_occupancy (
    person_id INTEGER REFERENCES person(person_id),
    housing_id INTEGER REFERENCES service_housing(housing_id),
    start_date DATE NOT NULL,
    end_date DATE,
    PRIMARY KEY (person_id, housing_id)
);
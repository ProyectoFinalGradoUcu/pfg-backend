-- ============================================================================
-- SEED DE DEMOSTRACIÓN: Datos ficticios para testing y presentación
--
-- Prerrequisitos:
--   1. migracion_integracion_personal.sql ya ejecutada
--   2. seed_integracion_personal.sql ya ejecutada
--
-- Este script carga datos de prueba para demostrar todas las funcionalidades
-- del sistema, incluyendo:
--   - Estructura organizativa realista de la FAU (12 unidades)
--   - 30+ funcionarios distribuidos en distintas unidades
--   - 7 usuarios con distintos roles y alcances
--   - Misiones, ascensos, cursos, destinos, retiros
--
-- NO debe ejecutarse en producción.
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.
--
-- Usuarios de demo (contraseña de todos: FAUdemo1!):
--   admin@fau.mil.uy        → Administrador (ya creado por seed_integracion)
--   jefe.personal@fau.mil.uy → Oficina de Personal (alcance global)
--   jefe.ba1@fau.mil.uy     → Control de cursos (alcance Base Aérea Nº 1)
--   jefe.ba2@fau.mil.uy     → Control de cursos (alcance Base Aérea Nº 2)
--   jefe.eta@fau.mil.uy     → Control de cursos (alcance Escuela Técnica)
--   consulta.coa@fau.mil.uy → Usuario lectura (alcance Comando Operaciones)
--   operador.cpfa@fau.mil.uy → Operador con permisos mixtos (Comando Personal)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 1: Estructura organizativa de la FAU
-- ═══════════════════════════════════════════════════════════════════════════════

-- Unidades principales (incluye CG que es referencia base)
INSERT INTO public.unidades (codigo, denominacion) VALUES
  ('CG',    'Cuartel General'),
  ('EMGFA', 'Estado Mayor General de la Fuerza Aérea'),
  ('COA',   'Comando Aéreo de Operaciones'),
  ('CPFA',  'Comando de Personal de la Fuerza Aérea'),
  ('BA1',   'Base Aérea Nº 1 "Cnel. Av. César L. Berisso"'),
  ('BA2',   'Base Aérea Nº 2 "Cap. Av. Cesáreo L. Berisso"'),
  ('EMA',   'Escuela Militar de Aeronáutica'),
  ('ETA',   'Escuela Técnica de Aeronáutica'),
  ('ECEMA', 'Escuela de Comando y Estado Mayor Aéreo'),
  ('BRAI',  'Brigada Aérea I'),
  ('GA3',   'Grupo de Aviación Nº 3 (Transporte)'),
  ('GA5',   'Grupo de Aviación Nº 5 (Helicópteros)')
ON CONFLICT (codigo) DO NOTHING;

-- Sub-unidades de ejemplo
INSERT INTO public.sub_unidades (unidad_id, codigo, denominacion)
SELECT u.id, s.codigo, s.denominacion
FROM (VALUES
  ('BA1', 'BA1-OPS',  'Sección Operaciones'),
  ('BA1', 'BA1-MANT', 'Sección Mantenimiento'),
  ('BA1', 'BA1-PERS', 'Oficina de Personal'),
  ('BA2', 'BA2-OPS',  'Sección Operaciones'),
  ('BA2', 'BA2-LOG',  'Sección Logística'),
  ('COA', 'COA-PLA',  'División Planificación'),
  ('COA', 'COA-INT',  'División Inteligencia')
) AS s(unidad_codigo, codigo, denominacion)
JOIN unidades u ON u.codigo = s.unidad_codigo
ON CONFLICT (unidad_id, codigo) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 2: Catálogos de referencia para demo
-- ═══════════════════════════════════════════════════════════════════════════════

-- Regímenes (leyes)
INSERT INTO public.regimenes (id, numero_ley, denominacion, vigente, es_ley_vieja)
SELECT CASE WHEN (SELECT count(*) FROM regimenes) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.regimenes', 'id')) END,
       v.numero_ley, v.denominacion, v.vigente, v.es_ley_vieja
FROM (VALUES
  (1, '14.157', 'Ley Vieja', true, true),
  (2, '19.695', 'Ley Nueva', true, false)
) AS v(id, numero_ley, denominacion, vigente, es_ley_vieja)
WHERE NOT EXISTS (SELECT 1 FROM regimenes x WHERE x.numero_ley = v.numero_ley);
SELECT setval(pg_get_serial_sequence('public.regimenes', 'id'), GREATEST((SELECT max(id) FROM regimenes), 1));

-- Programas presupuestales
INSERT INTO public.programas (id, codigo, denominacion, vigente)
SELECT CASE WHEN (SELECT count(*) FROM programas) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.programas', 'id')) END,
       v.codigo, v.denominacion, v.vigente
FROM (VALUES
  (1, '300', 'Programa 300', true),
  (2, '460', 'Programa 460', true)
) AS v(id, codigo, denominacion, vigente)
WHERE NOT EXISTS (SELECT 1 FROM programas x WHERE x.codigo = v.codigo);
SELECT setval(pg_get_serial_sequence('public.programas', 'id'), GREATEST((SELECT max(id) FROM programas), 1));

-- Situaciones

INSERT INTO public.situaciones (id, codigo, denominacion, calculador, afecta_cobro, sistema_salud)
SELECT CASE WHEN (SELECT count(*) FROM situaciones) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.situaciones', 'id')) END,
       v.codigo, v.denominacion, v.calculador, v.afecta_cobro, v.sistema_salud
FROM (VALUES
  (1, 'SIT01', 'Personal Superior en actividad.', 'Sit10Calculator', true, 'ssffaa'),
  (2, 'SIT02', 'Personal Superior en disponibilidad.', 'Sit20Calculator', true, 'ssffaa'),
  (3, 'SIT03', 'Licencia sin goce de sueldo.', 'SinCalculador', false, 'ssffaa'),
  (4, 'SIT04', 'Personal Superior no disponible.', 'SinCalculador', false, 'ssffaa'),
  (5, 'SIT05', 'Personal Superior reservistas.', 'ReservaSuperiorCalculator', true, 'ssffaa'),
  (6, 'SIT06', 'Personal Superior sueldo retenido.', 'SinCalculador', false, 'ssffaa'),
  (7, 'SIT07', 'Personal Subalterno en actividad.', 'Sit30Calculator', true, 'ssffaa'),
  (8, 'SIT08', 'Reservistas tropa.', 'ReservaCalculator', true, 'ssffaa'),
  (9, 'SIT09', 'Personal Subalterno con licencia s/goce de sueldo.', 'SinCalculador', false, 'ssffaa'),
  (10, 'SIT10', 'Reserva de cargo.', 'SinCalculador', false, 'ssffaa'),
  (11, 'SIT11', 'Personal Subalterno sueldo retenido.', 'SinCalculador', false, 'ssffaa'),
  (12, 'SIT12', 'Aspirantes y cadetes.', 'Sit40Calculator', true, 'ssffaa'),
  (13, 'SIT13', 'Aprendiz.', 'Sit40Calculator', true, 'ssffaa'),
  (14, 'SIT14', 'Baja del mes Señores Oficiales (para aguinaldo).', 'AguinaldoCalculator', true, 'ssffaa'),
  (15, 'SIT15', 'Baja del mes Personal Subalterno (para aguinaldo).', 'AguinaldoCalculator', true, 'ssffaa'),
  (16, 'SIT16', 'Personal Superior reincorporado.', 'Sit50Calculator', true, 'ssffaa'),
  (17, 'SIT17', 'Personal Subalterno reincorporado.', 'Sit50Calculator', true, 'ssffaa'),
  (18, 'SIT18', 'Aguinaldo baja reincorporado.', 'AguinaldoCalculator', true, 'ssffaa'),
  (19, 'SIT19', 'Civil presupuestado sin equiparar.', 'CivilCalculator', true, 'ssffaa'),
  (20, 'SIT20', 'Baja del mes civil presupuestado sin equiparar.', 'AguinaldoCalculator', true, 'ssffaa'),
  (21, 'SIT21', 'Civil contratado sin equiparar.', 'CivilCalculator', true, 'ssffaa'),
  (22, 'SIT22', 'Subsidio transitorio.', 'SubsidioCalculator', true, 'ssffaa')
) AS v(id, codigo, denominacion, calculador, afecta_cobro, sistema_salud)
WHERE NOT EXISTS (SELECT 1 FROM situaciones x WHERE x.codigo = v.codigo);
SELECT setval(pg_get_serial_sequence('public.situaciones', 'id'), GREATEST((SELECT max(id) FROM situaciones), 1));

-- Escalafones
INSERT INTO public.escalafones (id, codigo, denominacion)
SELECT CASE WHEN (SELECT count(*) FROM escalafones) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.escalafones', 'id')) END,
       v.codigo, v.denominacion
FROM (VALUES
  (1, 'AV', '(Av.)'),
  (2, 'NAV', '(Nav.)'),
  (3, 'TP', '(T.P.)'),
  (4, 'ESP', '(Esp.)'),
  (5, 'SG', '(S.G.)'),
  (6, 'AA', '(A.A.)'),
  (7, 'RVA', '(Rva.)'),
  (8, 'MANT', '(Mant.)'),
  (9, 'CYE', '(C.y E.)'),
  (10, 'MET', '(Met.)'),
  (11, 'SA', '(S.A.)'),
  (12, 'BM', '(B.M.)'),
  (13, 'ST', '(S.T.)'),
  (14, 'AT', '(A.T.)'),
  (15, 'ESC_3', 'Escalafón 3 (pendiente identificar)'),
  (16, 'ESC_9', 'Escalafón 9 (pendiente identificar)'),
  (17, 'ESC_11', 'Escalafón 11 (pendiente identificar)')
) AS v(id, codigo, denominacion)
WHERE NOT EXISTS (SELECT 1 FROM escalafones x WHERE x.codigo = v.codigo);
SELECT setval(pg_get_serial_sequence('public.escalafones', 'id'), GREATEST((SELECT max(id) FROM escalafones), 1));

INSERT INTO public.grados (id, codigo, denominacion, orden, es_oficial, es_subalterno)
SELECT CASE WHEN (SELECT count(*) FROM grados) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.grados', 'id')) END,
       v.codigo, v.denominacion, v.orden, v.es_oficial, v.es_subalterno
FROM (VALUES
  (1, 'SDO_1RA', 'Sdo. 1ª', 1, false, true),
  (2, 'CBO_2DA', 'Cbo. 2ª', 2, false, true),
  (3, 'CBO_1RA', 'Cbo. 1ª', 3, false, true),
  (4, 'SGTO', 'Sgto.', 4, false, true),
  (5, 'SGTO_1RO', 'Sgto. 1°', 5, false, true),
  (6, 'SOM', 'S.O.M.', 6, false, true),
  (7, 'ALF', 'Alf.', 7, true, false),
  (8, 'TTE_2DO', 'Tte. 2°', 8, true, false),
  (9, 'TTE_1RO', 'Tte. 1°', 9, true, false),
  (10, 'CAP', 'Cap.', 10, true, false),
  (11, 'MAY', 'May.', 11, true, false),
  (12, 'TTE_CNEL', 'Tte. Cnel.', 12, true, false),
  (13, 'CNEL', 'Cnel.', 13, true, false),
  (14, 'BRIG_GRAL', 'Brig. Gral.', 14, true, false),
  (15, 'GRAL', 'Gral. Del Aire', 15, true, false),
  (16, 'CAD_ASP', 'Cad. Asp.', 16, false, false),
  (17, 'CAD_1RO', 'Cad. 1°', 17, false, false),
  (18, 'CAD_2DO', 'Cad. 2°', 18, false, false),
  (19, 'CAD_3RO', 'Cad. 3°', 19, false, false),
  (20, 'AT_2DA', 'At. 2ª', 20, false, false),
  (21, 'AT_1RA', 'At. 1ª', 21, false, false),
  (22, 'AT_PPAL', 'At. Ppal.', 22, false, false),
  (23, 'INST_AT', 'Inst. At.', 23, false, false),
  (24, 'SUP_AT', 'Sup. At.', 24, false, false),
  (25, 'SDO_2DA', 'Sdo. 2ª', 0, false, true),
  (26, 'APRENDIZ', 'Aprendiz', 0, false, true),
  (27, 'CADETE_1RA', 'Cadete 1ª y Equivalentes', 0, false, true),
  (28, 'CADETE_2DA', 'Cadete 2ª y Equivalentes', 0, false, true),
  (29, 'CADETE_3RA', 'Cadete 3ª y Equivalentes', 0, false, true),
  (30, 'CADETE_ASP', 'Cadete - Aspirante', 0, false, true),
  (31, 'CADETE_EQV', 'Cadete Equivalente', 0, false, true)
) AS v(id, codigo, denominacion, orden, es_oficial, es_subalterno)
WHERE NOT EXISTS (SELECT 1 FROM grados x WHERE x.codigo = v.codigo);
SELECT setval(pg_get_serial_sequence('public.grados', 'id'), GREATEST((SELECT max(id) FROM grados), 1));

-- Motivos de baja
INSERT INTO public.motivos_baja (id, codigo, denominacion)
SELECT CASE WHEN (SELECT count(*) FROM motivos_baja) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.motivos_baja', 'id')) END,
       v.codigo, v.denominacion
FROM (VALUES
  (1, 'RETIRO_OBL', 'Baja por retiro obligatorio.'),
  (2, 'RETIRO_VOL', 'Baja por retiro voluntario.'),
  (3, 'BAJA_DEFINITIVA', 'Baja definitiva.'),
  (4, 'FALLECIMIENTO', 'Baja por fallecimiento.'),
  (5, 'MALA_CONDUCTA', 'Recisión por mala conducta.'),
  (6, 'TERMINO_CONTRATO', 'Baja por término de contrato.'),
  (7, 'INCAPACIDAD', 'Baja por incapacidad.'),
  (8, 'CESE', 'Baja por cese.'),
  (9, 'DESTITUCION', 'Baja por destitución.'),
  (10, 'ESPECIAL_CADETE', 'Baja especial MDN ( baja por ser alta como cadete).'),
  (11, 'ESPECIAL_APRENDIZ', 'Baja especial MDN ( baja por ser alta como aprendiz).')
) AS v(id, codigo, denominacion)
WHERE NOT EXISTS (SELECT 1 FROM motivos_baja x WHERE x.codigo = v.codigo);
SELECT setval(pg_get_serial_sequence('public.motivos_baja', 'id'), GREATEST((SELECT max(id) FROM motivos_baja), 1));

-- Tipos de movimiento (el ascenso en liquidación registra "Cambio de Situacion" + "Ascenso")
INSERT INTO public.tipos_movimiento (id, nombre, es_alta)
SELECT CASE WHEN (SELECT count(*) FROM tipos_movimiento) = 0 THEN v.id ELSE nextval(pg_get_serial_sequence('public.tipos_movimiento', 'id')) END,
       v.nombre, v.es_alta
FROM (VALUES
  (1, 'Alta por ingreso.', true),
  (2, 'Alta reserva.', true),
  (3, 'Alta por Ascenso', true),
  (4, 'Pase', true),
  (5, 'Reincorporacion', true),
  (6, 'Reintegro', true),
  (7, 'Baja', false),
  (8, 'Retiro', false),
  (9, 'Baja por Ascenso', false),
  (10, 'Ascenso', false),
  (11, 'Cambio de Situacion', false),
  (12, 'Licencia Sin Goce', false)
) AS v(id, nombre, es_alta)
WHERE NOT EXISTS (SELECT 1 FROM tipos_movimiento x WHERE x.nombre = v.nombre);
SELECT setval(pg_get_serial_sequence('public.tipos_movimiento', 'id'), GREATEST((SELECT max(id) FROM tipos_movimiento), 1));


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 3: Cursos
-- ═══════════════════════════════════════════════════════════════════════════════

-- Cursos generales (sin unidad = visibles para todos)
INSERT INTO public.cursos (nombre_curso, institucion, es_obligatorio, unidad_id)
SELECT v.nombre, v.inst, v.oblig, NULL
FROM (VALUES
  ('Curso 1er. Año Común Único "Reclutamiento"',                             'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 2do. Año "Aviónica (BO)"',                        'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 2do. Año "Célula (BN)"',                          'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 3er. Año "Sistema Motopropulsor (BM)"',           'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso de Pasaje de Grado de Sgto. para Sgto. 1ro. (M-03)',              'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso de Comando y Estado Mayor Aéreo',                                  'ECEMA',                          FALSE),
  ('Curso Básico de Instrucción Militar',                                    'Escuela Militar de Aeronáutica', TRUE)
) AS v(nombre, inst, oblig)
WHERE NOT EXISTS (SELECT 1 FROM cursos c WHERE c.nombre_curso = v.nombre);

-- Cursos asignados a unidades (solo visibles/gestionables por esa unidad)
INSERT INTO cursos (nombre_curso, institucion, es_obligatorio, unidad_id)
SELECT v.nombre, v.inst, true, u.id
FROM (VALUES
  ('Curso de Seguridad en Vuelo BA1',            'Base Aérea Nº 1',  'BA1'),
  ('Curso de Mantenimiento de Aeronaves BA1',    'Base Aérea Nº 1',  'BA1'),
  ('Curso de Operaciones Aéreas BA2',            'Base Aérea Nº 2',  'BA2'),
  ('Curso de Navegación Instrumental BA2',       'Base Aérea Nº 2',  'BA2'),
  ('Taller de Aviónica Nivel 1',                 'ETA',              'ETA'),
  ('Taller de Aviónica Nivel 2',                 'ETA',              'ETA'),
  ('Curso de Formación de Oficiales',            'EMA',              'EMA')
) AS v(nombre, inst, unidad_codigo)
JOIN unidades u ON u.codigo = v.unidad_codigo
WHERE NOT EXISTS (SELECT 1 FROM cursos c WHERE c.nombre_curso = v.nombre);

-- Módulos para un curso
INSERT INTO modulos_curso (curso_id, nombre_modulo, orden_modulo, descripcion)
SELECT c.id, m.nombre, m.orden, m.desc
FROM cursos c
JOIN (VALUES
  ('Curso de Seguridad en Vuelo BA1', 'Fundamentos de Seguridad Aérea',        1, 'Normativa y procedimientos básicos'),
  ('Curso de Seguridad en Vuelo BA1', 'Gestión de Riesgos Operacionales',      2, 'Identificación y mitigación de riesgos'),
  ('Curso de Seguridad en Vuelo BA1', 'Investigación de Accidentes',           3, 'Metodología de investigación'),
  ('Curso de Seguridad en Vuelo BA1', 'Evaluación Final',                      4, 'Examen teórico-práctico')
) AS m(curso_nombre, nombre, orden, "desc") ON c.nombre_curso = m.curso_nombre
WHERE NOT EXISTS (
  SELECT 1 FROM modulos_curso mc WHERE mc.curso_id = c.id AND mc.nombre_modulo = m.nombre
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 4: Misiones
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.misiones
  (nombre_mision, pais, tipo_mision, fecha_salida, fecha_llegada, numero_orden, boletin, comando_responsable, observaciones)
SELECT v.nombre, v.pais, v.tipo, v.fsal::date, v.freg::date, v.orden, v.boletin, v.cmd, v.obs
FROM (VALUES
  ('MONUSCO',  'Rep. Dem. del Congo', 'Misión de paz ONU',           '2010-03-15', '2024-06-30', 'O.D. 245/2010', 'B.P. 12/2010', 'Comando Aéreo de Operaciones', 'Unidad Aérea Uruguaya (URUAVU), Bell 212.'),
  ('MINUSTAH', 'Haití',               'Misión de paz ONU',           '2008-04-10', '2011-05-20', 'O.D. 088/2008', 'B.P. 04/2008', 'Comando Aéreo de Operaciones', 'C-212 Aviocar en Puerto Príncipe.'),
  ('BCAA 2024','Antártida',            'Apoyo logístico antártico',   '2024-11-05', '2025-03-10', 'O.D. 301/2024', 'B.P. 11/2024', 'Comando Aéreo de Operaciones', 'Puente aéreo C-130 Hércules KC-130H.'),
  ('CABA',     'Brasil',               'Ejercicio combinado',         '2025-04-01', '2025-04-15', 'O.D. 055/2025', 'B.P. 04/2025', 'Brigada Aérea I',              'Ejercicio CABA con Fuerza Aérea Brasileña.'),
  ('UNITAS',   'EE.UU.',              'Ejercicio multinacional',      '2024-07-10', '2024-08-05', 'O.D. 112/2024', 'B.P. 07/2024', 'Comando Aéreo de Operaciones', 'Ejercicio naval/aéreo UNITAS 2024.')
) AS v(nombre, pais, tipo, fsal, freg, orden, boletin, cmd, obs)
WHERE NOT EXISTS (
  SELECT 1 FROM misiones m WHERE m.nombre_mision = v.nombre
);

-- Convocatorias (instancias de misión)
INSERT INTO convocatorias (mision_id, numero_orden, boletin, fecha_salida, fecha_llegada, observaciones)
SELECT m.id, v.orden, v.boletin, v.fsal::date, v.freg::date, v.obs
FROM (VALUES
  ('MONUSCO',  'O.D. 245/2010', 'B.P. 12/2010', '2010-03-15', '2011-03-14', 'Primer contingente URUAVU'),
  ('MONUSCO',  'O.D. 310/2011', 'B.P. 03/2011', '2011-03-15', '2012-03-14', 'Segundo contingente URUAVU'),
  ('BCAA 2024','O.D. 301/2024', 'B.P. 11/2024', '2024-11-05', '2025-03-10', 'Campaña antártica 2024-2025')
) AS v(mision_nombre, orden, boletin, fsal, freg, obs)
JOIN misiones m ON m.nombre_mision = v.mision_nombre
WHERE NOT EXISTS (
  SELECT 1 FROM convocatorias c WHERE c.mision_id = m.id AND c.numero_orden = v.orden
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 5: Destinos
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.destinos (ubicacion, numero_orden, tipo_destino)
SELECT v.ubicacion, v.orden, v.tipo FROM (VALUES
  ('Comando Aéreo de Operaciones (C.O.A.)', 'O.D. 11007', 'Unidad'),
  ('Base Aérea Nº 1 (B.A.I)',               'O.D. 10859', 'Unidad'),
  ('Base Aérea Nº 2 (B.A.II)',              'O.D. 10860', 'Unidad'),
  ('Estado Mayor General (E.M.G.F.A.)',      'O.D. 11760', 'Organismo'),
  ('Escuela Técnica de Aeronáutica',         'O.D. 10900', 'Escuela'),
  ('Escuela Militar de Aeronáutica',         'O.D. 10901', 'Escuela'),
  ('Grupo de Aviación Nº 3',                'O.D. 11100', 'Unidad'),
  ('Grupo de Aviación Nº 5',                'O.D. 11102', 'Unidad')
) AS v(ubicacion, orden, tipo)
WHERE NOT EXISTS (SELECT 1 FROM destinos d WHERE d.ubicacion = v.ubicacion);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 6: Personas (30+ funcionarios distribuidos)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.personas (cedula, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, genero, fecha_nacimiento, email)
SELECT p.cedula, p.nombre1, p.nombre2, p.apellido1, p.apellido2, p.genero, p.fnac::date, p.email
FROM (VALUES
  -- Oficiales (Base Aérea 1)
  ('60000001', 'Ana',       'María',   'Pereyra',    'López',    'Femenino',  '1978-02-10', 'ana.pereyra@fau.mil.uy'),
  ('60000002', 'Carlos',    'Eduardo', 'Méndez',     'Silva',    'Masculino', '1976-05-22', 'carlos.mendez@fau.mil.uy'),
  ('60000003', 'Sofía',     NULL,      'Larrosa',    'Ferreira', 'Femenino',  '1983-07-01', 'sofia.larrosa@fau.mil.uy'),
  -- Oficiales (Base Aérea 2)
  ('60000004', 'Jorge',     'Luis',    'Silva',      'Acosta',   'Masculino', '1982-11-15', 'jorge.silva@fau.mil.uy'),
  ('60000005', 'Valentina', NULL,      'Cruz',       'Bentancor','Femenino',  '1987-03-30', 'valentina.cruz@fau.mil.uy'),
  ('60000006', 'Pablo',     'Andrés',  'Núñez',      'Olivera',  'Masculino', '1986-09-09', 'pablo.nunez@fau.mil.uy'),
  -- Oficiales (COA / EMGFA)
  ('60000007', 'Mariana',   NULL,      'Díaz',       'Rodríguez','Femenino',  '1975-01-18', 'mariana.diaz@fau.mil.uy'),
  ('60000008', 'Andrés',    'Rafael',  'Rey',        'Suárez',   'Masculino', '1974-12-05', 'andres.rey@fau.mil.uy'),
  -- Subalternos (Base Aérea 1)
  ('60000009', 'Lucía',     NULL,      'Bentancor',  'Vega',     'Femenino',  '1989-06-12', 'lucia.bentancor@fau.mil.uy'),
  ('60000010', 'Ramón',     NULL,      'Ferreira',   'Díaz',     'Masculino', '1988-08-25', 'ramon.ferreira@fau.mil.uy'),
  ('60000011', 'Camila',    'Belén',   'Suárez',     'Rey',      'Femenino',  '1993-04-14', 'camila.suarez@fau.mil.uy'),
  ('60000012', 'Federico',  NULL,      'Olivera',    'Méndez',   'Masculino', '1992-10-02', 'federico.olivera@fau.mil.uy'),
  -- Subalternos (Base Aérea 2)
  ('60000013', 'Paula',     NULL,      'Vega',       'Larrosa',  'Femenino',  '1995-05-20', 'paula.vega@fau.mil.uy'),
  ('60000014', 'Gustavo',   'Daniel',  'Rodríguez',  'Cruz',     'Masculino', '1994-07-07', 'gustavo.rodriguez@fau.mil.uy'),
  ('60000015', 'Martín',    NULL,      'González',   'Núñez',    'Masculino', '1991-03-15', 'martin.gonzalez@fau.mil.uy'),
  ('60000016', 'Laura',     'Cecilia', 'Acosta',     'Ferreira', 'Femenino',  '1993-08-22', 'laura.acosta@fau.mil.uy'),
  -- Subalternos (ETA - Escuela Técnica)
  ('60000017', 'Diego',     NULL,      'Pérez',      'Silva',    'Masculino', '1996-02-14', 'diego.perez@fau.mil.uy'),
  ('60000018', 'Florencia', NULL,      'Martínez',   'López',    'Femenino',  '1997-11-30', 'florencia.martinez@fau.mil.uy'),
  ('60000019', 'Santiago',  'Nicolás', 'López',      'Acosta',   'Masculino', '1998-06-05', 'santiago.lopez@fau.mil.uy'),
  -- Subalternos (COA)
  ('60000020', 'Victoria',  NULL,      'Castro',     'Rey',      'Femenino',  '1990-09-18', 'victoria.castro@fau.mil.uy'),
  ('60000021', 'Rodrigo',   NULL,      'Fernández',  'Olivera',  'Masculino', '1991-04-25', 'rodrigo.fernandez@fau.mil.uy'),
  -- CPFA (Comando de Personal)
  ('60000022', 'Cecilia',   NULL,      'Torres',     'Díaz',     'Femenino',  '1985-12-01', 'cecilia.torres@fau.mil.uy'),
  ('60000023', 'Roberto',   'Daniel',  'Sosa',       'Martínez', 'Masculino', '1984-07-19', 'roberto.sosa@fau.mil.uy'),
  -- GA3 y GA5
  ('60000024', 'Ignacio',   NULL,      'Cardozo',    'Pérez',    'Masculino', '1988-01-10', 'ignacio.cardozo@fau.mil.uy'),
  ('60000025', 'Daniela',   NULL,      'Ramos',      'Castro',   'Femenino',  '1990-05-28', 'daniela.ramos@fau.mil.uy'),
  -- Funcionarios de baja / retiro
  ('60000026', 'Juan',      'Carlos',  'Rodríguez',  'Sosa',     'Masculino', '1965-05-05', 'juan.rodriguez@fau.mil.uy'),
  ('60000027', 'Pedro',     NULL,      'Fernández',  'Torres',   'Masculino', '1968-09-09', 'pedro.fernandez@fau.mil.uy'),
  -- Civiles
  ('60000028', 'María',     'José',    'Gómez',      'Ramos',    'Femenino',  '1980-03-12', 'maria.gomez@fau.mil.uy'),
  ('60000029', 'Fernando',  NULL,      'Duarte',     'Cardozo',  'Masculino', '1982-08-20', 'fernando.duarte@fau.mil.uy'),
  -- EMA (Escuela Militar de Aeronáutica)
  ('60000030', 'Alejandro', NULL,      'Ibarra',     'González', 'Masculino', '1979-04-15', 'alejandro.ibarra@fau.mil.uy')
) AS p(cedula, nombre1, nombre2, apellido1, apellido2, genero, fnac, email)
ON CONFLICT (cedula) DO UPDATE SET
  genero = EXCLUDED.genero,
  segundo_nombre = EXCLUDED.segundo_nombre,
  segundo_apellido = EXCLUDED.segundo_apellido;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 7: Relaciones laborales
-- ═══════════════════════════════════════════════════════════════════════════════

-- Oficiales en Base Aérea 1
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, prima_tecnica, tipo_funcionario)
SELECT per.id, reg.id, uni.id,
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT01'),
  esc.id, gr.id, v.fecha::date, 'activo', v.prima, 'oficial'
FROM (VALUES
  ('60000001', 'AV', 'CNEL', 'BA1',  '19.695',  'A',     '2001-03-01'),
  ('60000002', 'AV', 'MAY', 'BA1',  '19.695',  'VACIO', '2010-02-01'),
  ('60000003', 'AV', 'CAP', 'BA1',  '14.157', 'B',     '2012-06-15')
) AS v(cedula, esc_cod, grado_cod, unidad_cod, ley, prima, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN escalafones esc ON esc.codigo = v.esc_cod
JOIN grados gr ON gr.codigo = v.grado_cod
JOIN regimenes reg ON reg.numero_ley = v.ley
JOIN unidades uni ON uni.codigo = v.unidad_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Oficiales en Base Aérea 2
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, prima_tecnica, tipo_funcionario)
SELECT per.id, reg.id, uni.id,
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT01'),
  esc.id, gr.id, v.fecha::date, 'activo', v.prima, 'oficial'
FROM (VALUES
  ('60000004', 'AV', 'TTE_CNEL', 'BA2',  '19.695',  'A',     '2008-03-01'),
  ('60000005', 'AV', 'MAY', 'BA2',  '19.695',  'A',     '2014-02-01'),
  ('60000006', 'AV', 'CAP', 'BA2',  '19.695',  'VACIO', '2016-06-15')
) AS v(cedula, esc_cod, grado_cod, unidad_cod, ley, prima, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN escalafones esc ON esc.codigo = v.esc_cod
JOIN grados gr ON gr.codigo = v.grado_cod
JOIN regimenes reg ON reg.numero_ley = v.ley
JOIN unidades uni ON uni.codigo = v.unidad_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Oficiales superiores (COA / EMGFA)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, prima_tecnica, tipo_funcionario)
SELECT per.id, reg.id, uni.id,
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT01'),
  esc.id, gr.id, v.fecha::date, 'activo', v.prima, 'oficial'
FROM (VALUES
  ('60000007', 'AV', 'CNEL',  'COA',   '19.695', 'A',     '2000-03-01'),
  ('60000008', 'AV', 'BRIG_GRAL',  'EMGFA', '19.695', 'A',     '1998-03-01')
) AS v(cedula, esc_cod, grado_cod, unidad_cod, ley, prima, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN escalafones esc ON esc.codigo = v.esc_cod
JOIN grados gr ON gr.codigo = v.grado_cod
JOIN regimenes reg ON reg.numero_ley = v.ley
JOIN unidades uni ON uni.codigo = v.unidad_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Subalternos en Base Aérea 1
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  (SELECT id FROM unidades WHERE codigo = 'BA1'),
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT07'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000009', 'SGTO',  '2012-01-15'),
  ('60000010', 'SGTO_1RO',  '2010-06-01'),
  ('60000011', 'CBO_1RA',  '2015-03-01'),
  ('60000012', 'CBO_2DA',  '2018-01-15')
) AS v(cedula, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN grados gr ON gr.codigo = v.grado_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Subalternos en Base Aérea 2
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  (SELECT id FROM unidades WHERE codigo = 'BA2'),
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT07'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000013', 'CBO_1RA',  '2017-02-01'),
  ('60000014', 'SGTO',  '2014-08-15'),
  ('60000015', 'SGTO_1RO',  '2013-01-01'),
  ('60000016', 'CBO_2DA',  '2019-06-01')
) AS v(cedula, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN grados gr ON gr.codigo = v.grado_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Subalternos en ETA
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  (SELECT id FROM unidades WHERE codigo = 'ETA'),
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT07'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000017', 'CBO_1RA',  '2018-03-01'),
  ('60000018', 'CBO_2DA',  '2019-08-15'),
  ('60000019', 'SDO_1RA',  '2020-01-15')
) AS v(cedula, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN grados gr ON gr.codigo = v.grado_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Subalternos en COA
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  (SELECT id FROM unidades WHERE codigo = 'COA'),
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT07'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000020', 'SOM',  '2008-05-01'),
  ('60000021', 'SGTO',  '2013-02-15')
) AS v(cedula, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN grados gr ON gr.codigo = v.grado_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- CPFA (Comando de Personal)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  (SELECT id FROM unidades WHERE codigo = 'CPFA'),
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = CASE WHEN v.tipo = 'oficial' THEN 'SIT01' ELSE 'SIT07' END),
  esc.id, gr.id, v.fecha::date, 'activo', v.tipo
FROM (VALUES
  ('60000022', 'AV', 'MAY', '2010-06-01', 'oficial'),
  ('60000023', 'ST', 'SOM',  '2005-03-15', 'subalterno')
) AS v(cedula, esc_cod, grado_cod, fecha, tipo)
JOIN personas per ON per.cedula = v.cedula
JOIN escalafones esc ON esc.codigo = v.esc_cod
JOIN grados gr ON gr.codigo = v.grado_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- GA3 y GA5
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  uni.id,
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT07'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000024', 'GA3', 'SGTO_1RO', '2011-04-01'),
  ('60000025', 'GA5', 'SGTO', '2012-09-15')
) AS v(cedula, unidad_cod, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN unidades uni ON uni.codigo = v.unidad_cod
JOIN grados gr ON gr.codigo = v.grado_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Baja por solicitud (60000026)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, fecha_fin, estado, motivo_baja_id, tipo_funcionario)
SELECT
  (SELECT id FROM personas WHERE cedula = '60000026'),
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  (SELECT id FROM unidades WHERE codigo = 'BA1'),
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT07'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  (SELECT id FROM grados WHERE codigo = 'SOM'),
  DATE '1990-03-01', DATE '2025-06-30', 'inactivo',
  (SELECT id FROM motivos_baja WHERE codigo = 'RETIRO_VOL'), 'subalterno'
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = (SELECT id FROM personas WHERE cedula = '60000026')
);

-- Retiro obligatorio (60000027)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, fecha_fin, estado, tipo_funcionario)
SELECT
  (SELECT id FROM personas WHERE cedula = '60000027'),
  (SELECT id FROM regimenes WHERE numero_ley = '14.157'),
  (SELECT id FROM unidades WHERE codigo = 'COA'),
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT01'),
  (SELECT id FROM escalafones WHERE codigo = 'AV'),
  (SELECT id FROM grados WHERE codigo = 'CNEL'),
  DATE '1992-02-01', DATE '2025-01-01', 'inactivo', 'oficial'
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = (SELECT id FROM personas WHERE cedula = '60000027')
);

-- Civiles (60000028, 60000029)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  uni.id,
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT07'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  (SELECT id FROM grados WHERE codigo = 'SDO_1RA'),
  v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000028', 'CPFA', '2015-04-01'),
  ('60000029', 'BA1',  '2016-08-15')
) AS v(cedula, unidad_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN unidades uni ON uni.codigo = v.unidad_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- EMA (oficial instructor)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, estado, tipo_funcionario)
SELECT
  (SELECT id FROM personas WHERE cedula = '60000030'),
  (SELECT id FROM regimenes WHERE numero_ley = '19.695'),
  (SELECT id FROM unidades WHERE codigo = 'EMA'),
  (SELECT id FROM programas WHERE codigo = '300'),
  (SELECT id FROM situaciones WHERE codigo = 'SIT01'),
  (SELECT id FROM escalafones WHERE codigo = 'AV'),
  (SELECT id FROM grados WHERE codigo = 'TTE_CNEL'),
  DATE '2003-02-01', 'activo', 'oficial'
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = (SELECT id FROM personas WHERE cedula = '60000030')
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 8: Ascensos, retiros, asignaciones
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ascensos. Necesita migration_ascensos.sql aplicado: usa `numero_orden` y
-- `grado_anterior_id`, que son columnas de ese script.
INSERT INTO ascensos (persona_id, grado_anterior_id, grado_id, fecha_ascenso, numero_orden)
SELECT per.id, ga.id, g.id, v.fecha::date, v.orden
FROM (VALUES
  ('60000001', 'ALF',      'TTE_2DO',  '2003-02-01', 'O.D. 045/03'),
  ('60000001', 'TTE_2DO',  'CAP',      '2008-02-01', 'O.D. 078/08'),
  ('60000001', 'CAP',      'MAY',      '2014-02-01', 'O.D. 112/14'),
  ('60000001', 'MAY',      'CNEL',     '2020-02-01', 'O.D. 033/20'),
  ('60000004', 'TTE_1RO',  'CAP',      '2009-02-01', 'O.D. 055/09'),
  ('60000004', 'CAP',      'MAY',      '2015-02-01', 'O.D. 089/15'),
  ('60000004', 'MAY',      'TTE_CNEL', '2021-02-01', 'O.D. 041/21'),
  ('60000010', 'CBO_1RA',  'SGTO',     '2015-02-01', 'O.D. 098/15'),
  ('60000010', 'SGTO',     'SGTO_1RO', '2020-02-01', 'O.D. 045/20')
) AS v(cedula, grado_anterior_cod, grado_cod, fecha, orden)
JOIN personas per ON per.cedula = v.cedula
JOIN grados g ON g.codigo = v.grado_cod
JOIN grados ga ON ga.codigo = v.grado_anterior_cod
WHERE NOT EXISTS (
  SELECT 1 FROM ascensos a WHERE a.persona_id = per.id AND a.grado_id = g.id
);

-- De `fecha_ultimo_ascenso` salen la permanencia 041.003 de liquidación y la
-- antigüedad en el grado que evalúa el motor de ascensos. Sin esto, quien tiene
-- ascensos cargados la cuenta desde su fecha de ingreso.
UPDATE relaciones_laborales r
SET fecha_ultimo_ascenso = ult.fecha_ascenso
FROM (
    SELECT persona_id, MAX(fecha_ascenso) AS fecha_ascenso
    FROM ascensos
    WHERE fecha_ascenso IS NOT NULL
      AND anulado_en IS NULL
    GROUP BY persona_id
) ult
WHERE r.persona_id = ult.persona_id
  AND r.fecha_fin IS NULL
  AND r.fecha_ultimo_ascenso IS NULL
  AND ult.fecha_ascenso >= r.fecha_inicio;

-- Retiro
INSERT INTO retiros (persona_id, fecha_retiro, motivo)
SELECT (SELECT id FROM personas WHERE cedula = '60000027'), DATE '2025-01-01', 'Retiro obligatorio por edad'
WHERE NOT EXISTS (
  SELECT 1 FROM retiros r WHERE r.persona_id = (SELECT id FROM personas WHERE cedula = '60000027')
);

-- Asignaciones a destinos
INSERT INTO asignaciones_funcionario (persona_id, destino_id, fecha_inicio, posicion_destino, observaciones)
SELECT per.id, des.id, v.fecha::date, v.cargo, v.obs
FROM (VALUES
  ('60000001', 'Base Aérea Nº 1 (B.A.I)',               '2020-03-01', 'Jefe de Base',              NULL),
  ('60000004', 'Base Aérea Nº 2 (B.A.II)',              '2021-06-01', 'Jefe de Base',              NULL),
  ('60000007', 'Comando Aéreo de Operaciones (C.O.A.)', '2018-02-01', 'Jefe de Operaciones',      NULL),
  ('60000008', 'Estado Mayor General (E.M.G.F.A.)',      '2015-03-01', 'Jefe del Estado Mayor',    'Designación directa'),
  ('60000024', 'Grupo de Aviación Nº 3',                '2015-04-01', 'Mecánico de vuelo C-130',  NULL),
  ('60000025', 'Grupo de Aviación Nº 5',                '2016-09-15', 'Tripulante Bell 212',      NULL)
) AS v(cedula, ubicacion, fecha, cargo, obs)
JOIN personas per ON per.cedula = v.cedula
JOIN destinos des ON des.ubicacion = v.ubicacion
WHERE NOT EXISTS (
  SELECT 1 FROM asignaciones_funcionario a WHERE a.persona_id = per.id AND a.destino_id = des.id
);

-- Funcionarios en misiones
INSERT INTO funcionarios_misiones (persona_id, mision_id, boletin, observaciones)
SELECT per.id, m.id, m.boletin, v.obs
FROM (VALUES
  ('60000001', 'MONUSCO',  'Comandante de contingente aéreo'),
  ('60000007', 'MONUSCO',  'Oficial de enlace'),
  ('60000024', 'BCAA 2024','Mecánico de aeronave C-130'),
  ('60000005', 'UNITAS',   'Piloto designado'),
  ('60000021', 'CABA',     'Personal de apoyo técnico')
) AS v(cedula, mision_nombre, obs)
JOIN personas per ON per.cedula = v.cedula
JOIN misiones m ON m.nombre_mision = v.mision_nombre
ON CONFLICT (persona_id, mision_id) DO NOTHING;

-- Funcionarios en cursos
INSERT INTO funcionarios_cursos (persona_id, curso_id, fecha_inicio, fecha_fin, aprobado, calificacion, observacion_calificacion)
SELECT per.id, c.id, v.fini::date, v.ffin::date, v.aprobado, v.calif, v.obs
FROM (VALUES
  ('60000011', 'Curso de Seguridad en Vuelo BA1',         '2024-03-01', NULL,          NULL,  NULL, NULL),
  ('60000012', 'Curso de Mantenimiento de Aeronaves BA1', '2024-06-01', '2024-12-15',  TRUE,  '8',  'Muy bueno'),
  ('60000013', 'Curso de Operaciones Aéreas BA2',         '2025-01-15', NULL,          NULL,  NULL, NULL),
  ('60000017', 'Taller de Aviónica Nivel 1',              '2024-04-01', '2024-10-30',  TRUE,  '10', 'Excelente'),
  ('60000018', 'Taller de Aviónica Nivel 2',              '2025-02-01', NULL,          NULL,  NULL, NULL)
) AS v(cedula, curso_nombre, fini, ffin, aprobado, calif, obs)
JOIN personas per ON per.cedula = v.cedula
JOIN cursos c ON c.nombre_curso = v.curso_nombre
ON CONFLICT (persona_id, curso_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 9: Roles adicionales y permisos por unidad
-- ═══════════════════════════════════════════════════════════════════════════════

-- Rol: Control de cursos (alcance unidad)
INSERT INTO roles (nombre, descripcion, aplicacion)
VALUES ('Control de cursos', 'Administra la formación de su unidad', 'personal')
ON CONFLICT (nombre, aplicacion) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.aplicacion = 'personal' AND p.nombre IN (
  'personas.ver.unidad',
  'cursos.ver.unidad',
  'cursos.gestionar.unidad'
)
WHERE r.nombre = 'Control de cursos' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- Rol: Operador de Personal (alcance unidad - puede editar personas de su unidad)
INSERT INTO roles (nombre, descripcion, aplicacion)
VALUES ('Operador de Personal', 'Gestiona el personal de su unidad', 'personal')
ON CONFLICT (nombre, aplicacion) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.aplicacion = 'personal' AND p.nombre IN (
  'personas.ver.unidad',
  'personas.crear.unidad',
  'personas.editar.unidad',
  'cursos.ver.unidad',
  'reportes.ejecutar.unidad'
)
WHERE r.nombre = 'Operador de Personal' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- Rol: Consulta (lectura global limitada)
INSERT INTO roles (nombre, descripcion, aplicacion)
VALUES ('Consulta', 'Solo lectura de personal de su unidad', 'personal')
ON CONFLICT (nombre, aplicacion) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.aplicacion = 'personal' AND p.nombre IN (
  'personas.ver.unidad',
  'cursos.ver.unidad'
)
WHERE r.nombre = 'Consulta' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 10: Asignar roles a unidades (herencia)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Las Bases Aéreas heredan "Control de cursos"
INSERT INTO unidades_roles (unidad_id, rol_id)
SELECT u.id, r.id
FROM unidades u
CROSS JOIN roles r
WHERE u.codigo IN ('BA1', 'BA2', 'ETA', 'EMA')
  AND r.nombre = 'Control de cursos' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- COA hereda "Consulta"
INSERT INTO unidades_roles (unidad_id, rol_id)
SELECT u.id, r.id
FROM unidades u
CROSS JOIN roles r
WHERE u.codigo = 'COA'
  AND r.nombre = 'Consulta' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- CPFA hereda "Operador de Personal"
INSERT INTO unidades_roles (unidad_id, rol_id)
SELECT u.id, r.id
FROM unidades u
CROSS JOIN roles r
WHERE u.codigo = 'CPFA'
  AND r.nombre = 'Operador de Personal' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 11: Usuarios del sistema
-- ═══════════════════════════════════════════════════════════════════════════════

-- NOTA: admin@fau.mil.uy ya existe del seed_integracion_personal.sql
-- Todos los usuarios demo: contraseña FAUdemo1!

-- 1. Jefe de Personal — Oficina de Personal, alcance GLOBAL (sin unidades)
INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id)
SELECT 'jefe.personal@fau.mil.uy', crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo', 'personal',
       (SELECT id FROM personas WHERE cedula = '60000022')
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'jefe.personal@fau.mil.uy' AND aplicacion = 'personal');

INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u
JOIN roles r ON r.nombre = 'Oficina de Personal' AND r.aplicacion = 'personal'
WHERE u.username = 'jefe.personal@fau.mil.uy' AND u.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- 2. Jefe BA1 — Sin rol directo, hereda "Control de cursos" de la unidad BA1
INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id)
SELECT 'jefe.ba1@fau.mil.uy', crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo', 'personal',
       (SELECT id FROM personas WHERE cedula = '60000001')
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'jefe.ba1@fau.mil.uy' AND aplicacion = 'personal');

INSERT INTO usuarios_unidades (usuario_id, unidad_id)
SELECT u.id, uni.id FROM usuarios u
CROSS JOIN unidades uni
WHERE u.username = 'jefe.ba1@fau.mil.uy' AND u.aplicacion = 'personal' AND uni.codigo = 'BA1'
ON CONFLICT DO NOTHING;

-- 3. Jefe BA2 — Sin rol directo, hereda "Control de cursos" de la unidad BA2
INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id)
SELECT 'jefe.ba2@fau.mil.uy', crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo', 'personal',
       (SELECT id FROM personas WHERE cedula = '60000004')
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'jefe.ba2@fau.mil.uy' AND aplicacion = 'personal');

INSERT INTO usuarios_unidades (usuario_id, unidad_id)
SELECT u.id, uni.id FROM usuarios u
CROSS JOIN unidades uni
WHERE u.username = 'jefe.ba2@fau.mil.uy' AND u.aplicacion = 'personal' AND uni.codigo = 'BA2'
ON CONFLICT DO NOTHING;

-- 4. Jefe ETA — Sin rol directo, hereda "Control de cursos" de la unidad ETA
INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id)
SELECT 'jefe.eta@fau.mil.uy', crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo', 'personal',
       (SELECT id FROM personas WHERE cedula = '60000030')
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'jefe.eta@fau.mil.uy' AND aplicacion = 'personal');

INSERT INTO usuarios_unidades (usuario_id, unidad_id)
SELECT u.id, uni.id FROM usuarios u
CROSS JOIN unidades uni
WHERE u.username = 'jefe.eta@fau.mil.uy' AND u.aplicacion = 'personal' AND uni.codigo = 'ETA'
ON CONFLICT DO NOTHING;

-- 5. Consulta COA — Sin rol directo, hereda "Consulta" del COA
INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id)
SELECT 'consulta.coa@fau.mil.uy', crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo', 'personal',
       (SELECT id FROM personas WHERE cedula = '60000020')
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'consulta.coa@fau.mil.uy' AND aplicacion = 'personal');

INSERT INTO usuarios_unidades (usuario_id, unidad_id)
SELECT u.id, uni.id FROM usuarios u
CROSS JOIN unidades uni
WHERE u.username = 'consulta.coa@fau.mil.uy' AND u.aplicacion = 'personal' AND uni.codigo = 'COA'
ON CONFLICT DO NOTHING;

-- 6. Operador CPFA — Sin rol directo, hereda "Operador de Personal" del CPFA
INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id)
SELECT 'operador.cpfa@fau.mil.uy', crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo', 'personal',
       (SELECT id FROM personas WHERE cedula = '60000023')
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'operador.cpfa@fau.mil.uy' AND aplicacion = 'personal');

INSERT INTO usuarios_unidades (usuario_id, unidad_id)
SELECT u.id, uni.id FROM usuarios u
CROSS JOIN unidades uni
WHERE u.username = 'operador.cpfa@fau.mil.uy' AND u.aplicacion = 'personal' AND uni.codigo = 'CPFA'
ON CONFLICT DO NOTHING;

-- 7. Supervisor multi-unidad — Tiene BA1 Y BA2 (demuestra multi-unidad)
INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id)
SELECT 'supervisor.bases@fau.mil.uy', crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo', 'personal',
       (SELECT id FROM personas WHERE cedula = '60000007')
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'supervisor.bases@fau.mil.uy' AND aplicacion = 'personal');

INSERT INTO usuarios_unidades (usuario_id, unidad_id)
SELECT u.id, uni.id FROM usuarios u
CROSS JOIN unidades uni
WHERE u.username = 'supervisor.bases@fau.mil.uy' AND u.aplicacion = 'personal'
  AND uni.codigo IN ('BA1', 'BA2')
ON CONFLICT DO NOTHING;

-- El supervisor tiene rol directo "Control de cursos" (para que tenga permisos .unidad)
INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u
JOIN roles r ON r.nombre = 'Control de cursos' AND r.aplicacion = 'personal'
WHERE u.username = 'supervisor.bases@fau.mil.uy' AND u.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================================
-- RESUMEN DE ESCENARIOS DEMO
-- ============================================================================
--
-- USUARIO                        UNIDADES    ROL                    ALCANCE          QUÉ PUEDE HACER
-- ───────────────────────────── ─────────── ────────────────────── ──────────────── ────────────────────────────────────
-- admin@fau.mil.uy               (ninguna)   Administrador          GLOBAL           Todo
-- jefe.personal@fau.mil.uy      (ninguna)   Oficina de Personal    GLOBAL           CRUD completo de todo el personal
-- jefe.ba1@fau.mil.uy            BA1         Control de cursos (h)  UNIDAD(BA1)      Ver personal BA1 + gestionar cursos BA1
-- jefe.ba2@fau.mil.uy            BA2         Control de cursos (h)  UNIDAD(BA2)      Ver personal BA2 + gestionar cursos BA2
-- jefe.eta@fau.mil.uy            ETA         Control de cursos (h)  UNIDAD(ETA)      Ver personal ETA + gestionar cursos ETA
-- consulta.coa@fau.mil.uy       COA         Consulta (h)           UNIDAD(COA)      Solo ver personal y cursos del COA
-- operador.cpfa@fau.mil.uy      CPFA        Operador Personal (h)  UNIDAD(CPFA)     CRUD personal CPFA + reportes CPFA
-- supervisor.bases@fau.mil.uy   BA1+BA2     Control de cursos (d)  UNIDAD(BA1,BA2)  Ver personal y cursos de AMBAS bases
--
-- (h) = heredado de la unidad   (d) = directo
--
-- ESCENARIOS CLAVE PARA DEMOSTRAR:
-- 1. jefe.ba1 NO puede ver personal de BA2 ni gestionar cursos de BA2
-- 2. supervisor.bases SÍ puede ver personal de BA1 Y BA2 simultáneamente
-- 3. jefe.personal SÍ puede ver TODO (alcance global)
-- 4. consulta.coa solo puede LEER, no editar nada
-- 5. operador.cpfa puede crear/editar personas pero solo las del CPFA
-- 6. admin puede gestionar usuarios, roles y unidades
-- ============================================================================
--
-- ESCENARIOS CLAVE PARA DEMOSTRAR:
-- 1. jefe.ba1 NO puede ver personal de BA2 ni gestionar cursos de BA2
-- 2. jefe.personal SÍ puede ver TODO (alcance global)
-- 3. consulta.coa solo puede LEER, no editar nada
-- 4. operador.cpfa puede crear/editar personas pero solo las del CPFA
-- 5. admin puede gestionar usuarios, roles y unidades
-- ============================================================================

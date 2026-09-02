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

-- Catálogos base (requeridos por relaciones_laborales)
INSERT INTO public.regimenes (numero_ley, denominacion)
VALUES ('LEY19101', 'Régimen Militar')
ON CONFLICT (numero_ley) DO NOTHING;

INSERT INTO public.programas (codigo, denominacion)
VALUES ('PROG01', 'Programa General')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.situaciones (codigo, denominacion, sistema_salud)
VALUES ('ACT', 'Actividad', 'ssffaa')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.escalafones (codigo, denominacion)
VALUES ('ST', 'Subalterno Técnico')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.grados (escalafon_id, codigo, denominacion, orden, es_subalterno)
SELECT e.id, g.codigo, g.denom, g.orden, true
FROM escalafones e
JOIN (VALUES
  ('SM', 'Suboficial Mayor',  10),
  ('SP', 'Sargento Primero',  11),
  ('SG', 'Sargento',          12),
  ('C1', 'Cabo Primero',      13),
  ('C2', 'Cabo Segundo',      14),
  ('S1', 'Soldado Primera',   15)
) AS g(codigo, denom, orden) ON true
WHERE e.codigo = 'ST'
  AND NOT EXISTS (SELECT 1 FROM grados x WHERE x.codigo = g.codigo);

-- Regímenes
INSERT INTO public.regimenes (numero_ley, denominacion, es_ley_vieja)
VALUES ('LEY_VIEJA', 'Régimen Ley Vieja (demo)', true)
ON CONFLICT (numero_ley) DO NOTHING;

-- Escalafones
INSERT INTO public.escalafones (codigo, denominacion) VALUES
  ('AT', 'Aerotécnico'),
  ('AV', 'Aviador')
ON CONFLICT (codigo) DO NOTHING;

-- Grados subalternos (Aerotécnico)
INSERT INTO public.grados (escalafon_id, codigo, denominacion, orden, es_oficial, es_subalterno)
SELECT e.id, 'SAT', 'Supervisor Aerotécnico', 9, false, true
FROM escalafones e WHERE e.codigo = 'AT'
  AND NOT EXISTS (SELECT 1 FROM grados g WHERE g.codigo = 'SAT');

-- Grados oficiales (Aviador)
INSERT INTO public.grados (escalafon_id, codigo, denominacion, orden, es_oficial, es_subalterno)
SELECT e.id, g.codigo, g.denom, g.orden, true, false
FROM escalafones e
JOIN (VALUES
  ('BGA', 'Brigadier General',  1),
  ('CNL', 'Coronel',            2),
  ('TCL', 'Teniente Coronel',   3),
  ('MAY', 'Mayor',              4),
  ('CAP', 'Capitán',            5),
  ('TT1', 'Teniente 1º',       6),
  ('TT2', 'Teniente 2º',       7)
) AS g(codigo, denom, orden) ON true
WHERE e.codigo = 'AV'
  AND NOT EXISTS (SELECT 1 FROM grados x WHERE x.codigo = g.codigo);

-- Situaciones adicionales
INSERT INTO public.situaciones (codigo, denominacion, sistema_salud) VALUES
  ('RET', 'Retiro',                 'ssffaa'),
  ('LIC', 'Licencia Sin Goce',     'ssffaa'),
  ('DIS', 'No Disponible',         'ssffaa')
ON CONFLICT (codigo) DO NOTHING;

-- Motivos de baja
INSERT INTO public.motivos_baja (codigo, denominacion)
SELECT v.codigo, v.denom FROM (VALUES
  ('BSOLIC', 'Baja por solicitarla'),
  ('RETOBL', 'Retiro obligatorio'),
  ('RETOLD', 'Retiro por edad'),
  ('FALLED', 'Fallecimiento')
) AS v(codigo, denom)
WHERE NOT EXISTS (SELECT 1 FROM motivos_baja m WHERE m.codigo = v.codigo);

-- Tipos de movimiento
INSERT INTO public.tipos_movimiento (nombre, es_alta)
SELECT v.nombre, v.es_alta FROM (VALUES
  ('Alta',             true),
  ('Pase de destino',  false),
  ('Ascenso',          false),
  ('Reincorporación',  true)
) AS v(nombre, es_alta)
WHERE NOT EXISTS (SELECT 1 FROM tipos_movimiento t WHERE t.nombre = v.nombre);

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
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  esc.id, gr.id, v.fecha::date, 'activo', v.prima, 'oficial'
FROM (VALUES
  ('60000001', 'AV', 'CNL', 'BA1',  'LEY19101',  'A',     '2005-03-01'),
  ('60000002', 'AV', 'MAY', 'BA1',  'LEY19101',  'VACIO', '2010-02-01'),
  ('60000003', 'AV', 'CAP', 'BA1',  'LEY_VIEJA', 'B',     '2012-06-15')
) AS v(cedula, esc_cod, grado_cod, unidad_cod, ley, prima, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN escalafones esc ON esc.codigo = v.esc_cod
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = esc.id
JOIN regimenes reg ON reg.numero_ley = v.ley
JOIN unidades uni ON uni.codigo = v.unidad_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Oficiales en Base Aérea 2
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, prima_tecnica, tipo_funcionario)
SELECT per.id, reg.id, uni.id,
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  esc.id, gr.id, v.fecha::date, 'activo', v.prima, 'oficial'
FROM (VALUES
  ('60000004', 'AV', 'TCL', 'BA2',  'LEY19101',  'A',     '2008-03-01'),
  ('60000005', 'AV', 'MAY', 'BA2',  'LEY19101',  'A',     '2014-02-01'),
  ('60000006', 'AV', 'CAP', 'BA2',  'LEY19101',  'VACIO', '2016-06-15')
) AS v(cedula, esc_cod, grado_cod, unidad_cod, ley, prima, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN escalafones esc ON esc.codigo = v.esc_cod
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = esc.id
JOIN regimenes reg ON reg.numero_ley = v.ley
JOIN unidades uni ON uni.codigo = v.unidad_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Oficiales superiores (COA / EMGFA)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, prima_tecnica, tipo_funcionario)
SELECT per.id, reg.id, uni.id,
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  esc.id, gr.id, v.fecha::date, 'activo', v.prima, 'oficial'
FROM (VALUES
  ('60000007', 'AV', 'CNL',  'COA',   'LEY19101', 'A',     '2000-03-01'),
  ('60000008', 'AV', 'BGA',  'EMGFA', 'LEY19101', 'A',     '1998-03-01')
) AS v(cedula, esc_cod, grado_cod, unidad_cod, ley, prima, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN escalafones esc ON esc.codigo = v.esc_cod
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = esc.id
JOIN regimenes reg ON reg.numero_ley = v.ley
JOIN unidades uni ON uni.codigo = v.unidad_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Subalternos en Base Aérea 1
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM unidades WHERE codigo = 'BA1'),
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000009', 'SG',  '2012-01-15'),
  ('60000010', 'SP',  '2010-06-01'),
  ('60000011', 'C1',  '2015-03-01'),
  ('60000012', 'C2',  '2018-01-15')
) AS v(cedula, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = (SELECT id FROM escalafones WHERE codigo = 'ST')
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Subalternos en Base Aérea 2
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM unidades WHERE codigo = 'BA2'),
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000013', 'C1',  '2017-02-01'),
  ('60000014', 'SG',  '2014-08-15'),
  ('60000015', 'SP',  '2013-01-01'),
  ('60000016', 'C2',  '2019-06-01')
) AS v(cedula, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = (SELECT id FROM escalafones WHERE codigo = 'ST')
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Subalternos en ETA
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM unidades WHERE codigo = 'ETA'),
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000017', 'C1',  '2018-03-01'),
  ('60000018', 'C2',  '2019-08-15'),
  ('60000019', 'S1',  '2020-01-15')
) AS v(cedula, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = (SELECT id FROM escalafones WHERE codigo = 'ST')
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Subalternos en COA
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM unidades WHERE codigo = 'COA'),
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000020', 'SM',  '2008-05-01'),
  ('60000021', 'SG',  '2013-02-15')
) AS v(cedula, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = (SELECT id FROM escalafones WHERE codigo = 'ST')
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- CPFA (Comando de Personal)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM unidades WHERE codigo = 'CPFA'),
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  esc.id, gr.id, v.fecha::date, 'activo', v.tipo
FROM (VALUES
  ('60000022', 'AV', 'MAY', '2010-06-01', 'oficial'),
  ('60000023', 'ST', 'SM',  '2005-03-15', 'subalterno')
) AS v(cedula, esc_cod, grado_cod, fecha, tipo)
JOIN personas per ON per.cedula = v.cedula
JOIN escalafones esc ON esc.codigo = v.esc_cod
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = esc.id
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- GA3 y GA5
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id, fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  uni.id,
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  gr.id, v.fecha::date, 'activo', 'subalterno'
FROM (VALUES
  ('60000024', 'GA3', 'SP', '2011-04-01'),
  ('60000025', 'GA5', 'SG', '2012-09-15')
) AS v(cedula, unidad_cod, grado_cod, fecha)
JOIN personas per ON per.cedula = v.cedula
JOIN unidades uni ON uni.codigo = v.unidad_cod
JOIN grados gr ON gr.codigo = v.grado_cod AND gr.escalafon_id = (SELECT id FROM escalafones WHERE codigo = 'ST')
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id AND rl.estado = 'activo'
);

-- Baja por solicitud (60000026)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, fecha_fin, estado, motivo_baja_id, tipo_funcionario)
SELECT
  (SELECT id FROM personas WHERE cedula = '60000026'),
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM unidades WHERE codigo = 'BA1'),
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  (SELECT id FROM grados WHERE codigo = 'SM' AND escalafon_id = (SELECT id FROM escalafones WHERE codigo = 'ST')),
  DATE '1990-03-01', DATE '2025-06-30', 'inactivo',
  (SELECT id FROM motivos_baja WHERE codigo = 'BSOLIC'), 'subalterno'
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = (SELECT id FROM personas WHERE cedula = '60000026')
);

-- Retiro obligatorio (60000027)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, fecha_fin, estado, tipo_funcionario)
SELECT
  (SELECT id FROM personas WHERE cedula = '60000027'),
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY_VIEJA'),
  (SELECT id FROM unidades WHERE codigo = 'COA'),
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'RET'),
  (SELECT id FROM escalafones WHERE codigo = 'AV'),
  (SELECT id FROM grados WHERE codigo = 'CNL'),
  DATE '1992-02-01', DATE '2025-01-01', 'inactivo', 'oficial'
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = (SELECT id FROM personas WHERE cedula = '60000027')
);

-- Civiles (60000028, 60000029)
INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, estado, tipo_funcionario)
SELECT per.id,
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  uni.id,
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'ST'),
  (SELECT id FROM grados WHERE codigo = 'S1'),
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
  (SELECT id FROM regimenes WHERE numero_ley = 'LEY19101'),
  (SELECT id FROM unidades WHERE codigo = 'EMA'),
  (SELECT id FROM programas WHERE codigo = 'PROG01'),
  (SELECT id FROM situaciones WHERE codigo = 'ACT'),
  (SELECT id FROM escalafones WHERE codigo = 'AV'),
  (SELECT id FROM grados WHERE codigo = 'TCL'),
  DATE '2003-02-01', 'activo', 'oficial'
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = (SELECT id FROM personas WHERE cedula = '60000030')
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECCIÓN 8: Ascensos, retiros, asignaciones
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ascensos
INSERT INTO ascensos (persona_id, grado_id, fecha_ascenso, observaciones)
SELECT per.id, g.id, v.fecha::date, v.obs
FROM (VALUES
  ('60000001', 'TT2', '2003-02-01', 'O.D. 045/03'),
  ('60000001', 'CAP', '2008-02-01', 'O.D. 078/08'),
  ('60000001', 'MAY', '2014-02-01', 'O.D. 112/14'),
  ('60000001', 'CNL', '2020-02-01', 'O.D. 033/20'),
  ('60000004', 'CAP', '2009-02-01', 'O.D. 055/09'),
  ('60000004', 'MAY', '2015-02-01', 'O.D. 089/15'),
  ('60000004', 'TCL', '2021-02-01', 'O.D. 041/21'),
  ('60000010', 'SG',  '2015-02-01', 'O.D. 098/15'),
  ('60000010', 'SP',  '2020-02-01', 'O.D. 045/20')
) AS v(cedula, grado_cod, fecha, obs)
JOIN personas per ON per.cedula = v.cedula
JOIN grados g ON g.codigo = v.grado_cod
WHERE NOT EXISTS (
  SELECT 1 FROM ascensos a WHERE a.persona_id = per.id AND a.grado_id = g.id
);

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

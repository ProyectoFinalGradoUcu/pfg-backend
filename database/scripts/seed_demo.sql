-- ============================================================================
-- SEED DE DEMOSTRACIÓN: Datos ficticios para testing y presentación
--
-- Prerrequisitos: la base de liquidación (db-init.sql + sus migraciones) con el
-- paquete de Personal aplicado encima (database/paquete-personal.txt).
-- Corre SOLO en local, último: `make reset`.
--
-- NO carga catálogos. Unidades, sub-unidades, grados, escalafones, situaciones,
-- regímenes, programas y motivos de baja son los de liquidación y se buscan por
-- código. Si un código no existe allá, este script falla en vez de inventarlo.
--
-- Estructura (la de liquidación): la unidad es el comando y el destino real es
-- la sub-unidad.
--   CAO → BAI, BAII, BAIII, SMETEO, SSRRAA, COA
--   CAP → ETA, EMA, ECEMA, CIAA, CIAB, SSFA
--   CAL → SABAST, SMANT, SINFRA, SCOM
--   CG  → DCG, BANDA
--
-- Carga 30 funcionarios repartidos en los 4 comandos, cursos, misiones,
-- ascensos, un retiro, destinos y 6 usuarios con distintos alcances.
--
-- NO debe ejecutarse en producción.
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.
--
-- Usuarios de demo (contraseña de todos: FAUdemo1!). El alcance de unidad es
-- por comando, porque así se resuelve (usuarios_unidades → unidades):
--   admin@fau.mil.uy            → Administrador (lo crea seed_integracion_personal)
--   jefe.personal@fau.mil.uy    → Oficina de Personal (alcance global)
--   jefe.cao@fau.mil.uy         → Control de cursos (alcance C.A.O.)
--   jefe.cap@fau.mil.uy         → Control de cursos (alcance C.A.P.)
--   consulta.cg@fau.mil.uy      → Consulta, solo lectura (alcance C.G.)
--   operador.cal@fau.mil.uy     → Operador de Personal (alcance C.A.L.)
--   supervisor.cao.cap@fau.mil.uy → Control de cursos (alcance C.A.O. + C.A.P.)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- Cursos asignados a un comando (solo visibles/gestionables por ese comando)
INSERT INTO cursos (nombre_curso, institucion, es_obligatorio, unidad_id)
SELECT v.nombre, v.inst, true, u.id
FROM (VALUES
  ('Curso de Seguridad en Vuelo BA1',            'Base Aérea Nº 1',  'CAO'),
  ('Curso de Mantenimiento de Aeronaves BA1',    'Base Aérea Nº 1',  'CAO'),
  ('Curso de Operaciones Aéreas BA2',            'Base Aérea Nº 2',  'CAO'),
  ('Curso de Navegación Instrumental BA2',       'Base Aérea Nº 2',  'CAO'),
  ('Taller de Aviónica Nivel 1',                 'ETA',              'CAP'),
  ('Taller de Aviónica Nivel 2',                 'ETA',              'CAP'),
  ('Curso de Formación de Oficiales',            'EMA',              'CAP')
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
--
-- Como en liquidación: cada relación lleva la unidad (comando) Y la sub-unidad
-- (destino real). La unidad sale de la sub-unidad, así nunca quedan desalineadas.
-- Todo se busca por código en los catálogos de liquidación: si un código no
-- existe, la verificación del final del bloque corta el script.

CREATE TEMP TABLE tmp_demo_relaciones (
  cedula     VARCHAR(20),
  sub_cod    VARCHAR(20),
  esc_cod    VARCHAR(20),
  grado_cod  VARCHAR(20),
  sit_cod    VARCHAR(20),
  ley        VARCHAR(20),
  prima      VARCHAR(10),
  tipo       VARCHAR(20),
  inicio     DATE,
  fin        DATE,
  estado     VARCHAR(20),
  motivo_cod VARCHAR(50)
) ON COMMIT DROP;

INSERT INTO tmp_demo_relaciones VALUES
  -- Oficiales — C.A.O. / B.A.I.
  ('60000001', 'BAI',    'AV', 'CNEL',      'SIT01', '19.695', 'A',     'oficial',    '2001-03-01', NULL, 'activo', NULL),
  ('60000002', 'BAI',    'AV', 'MAY',       'SIT01', '19.695', 'VACIO', 'oficial',    '2010-02-01', NULL, 'activo', NULL),
  ('60000003', 'BAI',    'AV', 'CAP',       'SIT01', '14.157', 'B',     'oficial',    '2012-06-15', NULL, 'activo', NULL),
  -- Oficiales — C.A.O. / B.A.II.
  ('60000004', 'BAII',   'AV', 'TTE_CNEL',  'SIT01', '19.695', 'A',     'oficial',    '2008-03-01', NULL, 'activo', NULL),
  ('60000005', 'BAII',   'AV', 'MAY',       'SIT01', '19.695', 'A',     'oficial',    '2014-02-01', NULL, 'activo', NULL),
  ('60000006', 'BAII',   'AV', 'CAP',       'SIT01', '19.695', 'VACIO', 'oficial',    '2016-06-15', NULL, 'activo', NULL),
  -- Oficiales superiores — C.A.O. / C.O.A. y C.G. / D.C.G.
  ('60000007', 'COA',    'AV', 'CNEL',      'SIT01', '19.695', 'A',     'oficial',    '2000-03-01', NULL, 'activo', NULL),
  ('60000008', 'DCG',    'AV', 'BRIG_GRAL', 'SIT01', '19.695', 'A',     'oficial',    '1998-03-01', NULL, 'activo', NULL),
  -- Subalternos — C.A.O. / B.A.I.
  ('60000009', 'BAI',    'ST', 'SGTO',      'SIT07', '19.695', NULL,    'subalterno', '2012-01-15', NULL, 'activo', NULL),
  ('60000010', 'BAI',    'ST', 'SGTO_1RO',  'SIT07', '19.695', NULL,    'subalterno', '2010-06-01', NULL, 'activo', NULL),
  ('60000011', 'BAI',    'ST', 'CBO_1RA',   'SIT07', '19.695', NULL,    'subalterno', '2015-03-01', NULL, 'activo', NULL),
  ('60000012', 'BAI',    'ST', 'CBO_2DA',   'SIT07', '19.695', NULL,    'subalterno', '2018-01-15', NULL, 'activo', NULL),
  -- Subalternos — C.A.O. / B.A.II.
  ('60000013', 'BAII',   'ST', 'CBO_1RA',   'SIT07', '19.695', NULL,    'subalterno', '2017-02-01', NULL, 'activo', NULL),
  ('60000014', 'BAII',   'ST', 'SGTO',      'SIT07', '19.695', NULL,    'subalterno', '2014-08-15', NULL, 'activo', NULL),
  ('60000015', 'BAII',   'ST', 'SGTO_1RO',  'SIT07', '19.695', NULL,    'subalterno', '2013-01-01', NULL, 'activo', NULL),
  ('60000016', 'BAII',   'ST', 'CBO_2DA',   'SIT07', '19.695', NULL,    'subalterno', '2019-06-01', NULL, 'activo', NULL),
  -- Subalternos — C.A.P. / E.T.A.
  ('60000017', 'ETA',    'ST', 'CBO_1RA',   'SIT07', '19.695', NULL,    'subalterno', '2018-03-01', NULL, 'activo', NULL),
  ('60000018', 'ETA',    'ST', 'CBO_2DA',   'SIT07', '19.695', NULL,    'subalterno', '2019-08-15', NULL, 'activo', NULL),
  ('60000019', 'ETA',    'ST', 'SDO_1RA',   'SIT07', '19.695', NULL,    'subalterno', '2020-01-15', NULL, 'activo', NULL),
  -- Subalternos — C.A.O. / C.O.A.
  ('60000020', 'COA',    'ST', 'SOM',       'SIT07', '19.695', NULL,    'subalterno', '2008-05-01', NULL, 'activo', NULL),
  ('60000021', 'COA',    'ST', 'SGTO',      'SIT07', '19.695', NULL,    'subalterno', '2013-02-15', NULL, 'activo', NULL),
  -- C.A.L. / S.ABAST.
  ('60000022', 'SABAST', 'AV', 'MAY',       'SIT01', '19.695', NULL,    'oficial',    '2010-06-01', NULL, 'activo', NULL),
  ('60000023', 'SABAST', 'ST', 'SOM',       'SIT07', '19.695', NULL,    'subalterno', '2005-03-15', NULL, 'activo', NULL),
  -- Mecánico C-130 — C.A.L. / S. MANT.; tripulante Bell 212 — C.A.O. / B.A.III.
  ('60000024', 'SMANT',  'ST', 'SGTO_1RO',  'SIT07', '19.695', NULL,    'subalterno', '2011-04-01', NULL, 'activo', NULL),
  ('60000025', 'BAIII',  'ST', 'SGTO',      'SIT07', '19.695', NULL,    'subalterno', '2012-09-15', NULL, 'activo', NULL),
  -- Baja por retiro voluntario (60000026) y retiro obligatorio (60000027)
  ('60000026', 'BAI',    'ST', 'SOM',       'SIT07', '19.695', NULL,    'subalterno', '1990-03-01', '2025-06-30', 'inactivo', 'RETIRO_VOL'),
  ('60000027', 'COA',    'AV', 'CNEL',      'SIT01', '14.157', NULL,    'oficial',    '1992-02-01', '2025-01-01', 'inactivo', 'RETIRO_OBL'),
  -- Civiles equiparados — C.A.L. / S.INFRA. y C.A.O. / B.A.I.
  ('60000028', 'SINFRA', 'ST', 'SDO_1RA',   'SIT07', '19.695', NULL,    'subalterno', '2015-04-01', NULL, 'activo', NULL),
  ('60000029', 'BAI',    'ST', 'SDO_1RA',   'SIT07', '19.695', NULL,    'subalterno', '2016-08-15', NULL, 'activo', NULL),
  -- Oficial instructor — C.A.P. / E.M.A.
  ('60000030', 'EMA',    'AV', 'TTE_CNEL',  'SIT01', '19.695', NULL,    'oficial',    '2003-02-01', NULL, 'activo', NULL);

-- Si algún código no existe en el catálogo de liquidación, cortar acá: un JOIN
-- que no matchea descartaría la fila en silencio.
DO $$
DECLARE faltantes TEXT;
BEGIN
  SELECT string_agg(DISTINCT t.cedula || ' (' || concat_ws(', ',
           CASE WHEN su.id  IS NULL THEN 'sub-unidad ' || t.sub_cod END,
           CASE WHEN esc.id IS NULL THEN 'escalafón '  || t.esc_cod END,
           CASE WHEN gr.id  IS NULL THEN 'grado '      || t.grado_cod END,
           CASE WHEN sit.id IS NULL THEN 'situación '  || t.sit_cod END,
           CASE WHEN reg.id IS NULL THEN 'régimen '    || t.ley END,
           CASE WHEN t.motivo_cod IS NOT NULL AND mb.id IS NULL THEN 'motivo ' || t.motivo_cod END) || ')', '; ')
    INTO faltantes
  FROM tmp_demo_relaciones t
  LEFT JOIN sub_unidades su  ON su.codigo = t.sub_cod
  LEFT JOIN escalafones  esc ON esc.codigo = t.esc_cod
  LEFT JOIN grados       gr  ON gr.codigo = t.grado_cod
  LEFT JOIN situaciones  sit ON sit.codigo = t.sit_cod
  LEFT JOIN regimenes    reg ON reg.numero_ley = t.ley
  LEFT JOIN motivos_baja mb  ON mb.codigo = t.motivo_cod
  WHERE su.id IS NULL OR esc.id IS NULL OR gr.id IS NULL OR sit.id IS NULL OR reg.id IS NULL
     OR (t.motivo_cod IS NOT NULL AND mb.id IS NULL)
     OR NOT EXISTS (SELECT 1 FROM programas WHERE codigo = '300');
  IF faltantes IS NOT NULL THEN
    RAISE EXCEPTION 'seed_demo: códigos que no existen en el catálogo de liquidación: %', faltantes;
  END IF;
END $$;

INSERT INTO relaciones_laborales
  (persona_id, regimen_id, unidad_id, sub_unidad_id, programa_id, situacion_id, escalafon_id, grado_id,
   fecha_inicio, fecha_fin, estado, prima_tecnica, motivo_baja_id, tipo_funcionario)
SELECT per.id, reg.id, su.unidad_id, su.id,
       (SELECT id FROM programas WHERE codigo = '300'),
       sit.id, esc.id, gr.id,
       t.inicio, t.fin, t.estado, t.prima, mb.id, t.tipo
FROM tmp_demo_relaciones t
JOIN personas      per ON per.cedula = t.cedula
JOIN sub_unidades  su  ON su.codigo = t.sub_cod
JOIN escalafones   esc ON esc.codigo = t.esc_cod
JOIN grados        gr  ON gr.codigo = t.grado_cod
JOIN situaciones   sit ON sit.codigo = t.sit_cod
JOIN regimenes     reg ON reg.numero_ley = t.ley
LEFT JOIN motivos_baja mb ON mb.codigo = t.motivo_cod
WHERE NOT EXISTS (
  SELECT 1 FROM relaciones_laborales rl WHERE rl.persona_id = per.id
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

-- Retiro (la relación laboral que cerró es la que se cargó inactiva arriba)
INSERT INTO retiros (persona_id, relacion_laboral_id, fecha_retiro, motivo, motivo_baja_id)
SELECT per.id, rl.id, DATE '2025-01-01', 'Retiro obligatorio por edad',
       (SELECT id FROM motivos_baja WHERE codigo = 'RETIRO_OBL')
FROM personas per
JOIN relaciones_laborales rl ON rl.persona_id = per.id AND rl.fecha_fin = DATE '2025-01-01'
WHERE per.cedula = '60000027'
  AND NOT EXISTS (SELECT 1 FROM retiros r WHERE r.persona_id = per.id);

-- Destinos: el destino va a la misma sub-unidad que la relación laboral activa,
-- con su comando en unidad_id.
INSERT INTO destinos (persona_id, unidad_id, sub_unidad_id, fecha_inicio, posicion_destino, numero_orden, observaciones)
SELECT per.id, su.unidad_id, su.id, v.fecha::date, v.cargo, v.orden, v.obs
FROM (VALUES
  ('60000001', 'BAI',   '2020-03-01', 'Jefe de Base',             'O.D. 10859', NULL),
  ('60000004', 'BAII',  '2021-06-01', 'Jefe de Base',             'O.D. 10860', NULL),
  ('60000007', 'COA',   '2018-02-01', 'Jefe de Operaciones',      'O.D. 11007', NULL),
  ('60000008', 'DCG',   '2015-03-01', 'Jefe del Estado Mayor',    'O.D. 11760', 'Designación directa'),
  ('60000024', 'SMANT', '2015-04-01', 'Mecánico de vuelo C-130',  'O.D. 11100', NULL),
  ('60000025', 'BAIII', '2016-09-15', 'Tripulante Bell 212',      'O.D. 11102', NULL)
) AS v(cedula, sub_cod, fecha, cargo, orden, obs)
JOIN personas per ON per.cedula = v.cedula
JOIN sub_unidades su ON su.codigo = v.sub_cod
WHERE NOT EXISTS (
  SELECT 1 FROM destinos d WHERE d.persona_id = per.id AND d.fecha_inicio = v.fecha::date
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

-- unidades_roles es nuestra; las unidades son los comandos de liquidación.

-- C.A.O. y C.A.P. heredan "Control de cursos"
INSERT INTO unidades_roles (unidad_id, rol_id)
SELECT u.id, r.id
FROM unidades u
CROSS JOIN roles r
WHERE u.codigo IN ('CAO', 'CAP')
  AND r.nombre = 'Control de cursos' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- C.G. hereda "Consulta"
INSERT INTO unidades_roles (unidad_id, rol_id)
SELECT u.id, r.id
FROM unidades u
CROSS JOIN roles r
WHERE u.codigo = 'CG'
  AND r.nombre = 'Consulta' AND r.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

-- C.A.L. hereda "Operador de Personal"
INSERT INTO unidades_roles (unidad_id, rol_id)
SELECT u.id, r.id
FROM unidades u
CROSS JOIN roles r
WHERE u.codigo = 'CAL'
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

-- 2..6: usuarios con alcance de unidad. Ninguno tiene rol directo salvo el
-- supervisor: heredan el rol del comando que tienen asignado (unidades_roles).
CREATE TEMP TABLE tmp_demo_usuarios (
  username VARCHAR(100),
  cedula   VARCHAR(20),
  comandos TEXT[]
) ON COMMIT DROP;

INSERT INTO tmp_demo_usuarios VALUES
  ('jefe.cao@fau.mil.uy',           '60000001', ARRAY['CAO']),        -- Control de cursos (h)
  ('jefe.cap@fau.mil.uy',           '60000030', ARRAY['CAP']),        -- Control de cursos (h)
  ('consulta.cg@fau.mil.uy',        '60000008', ARRAY['CG']),         -- Consulta (h)
  ('operador.cal@fau.mil.uy',       '60000023', ARRAY['CAL']),        -- Operador de Personal (h)
  ('supervisor.cao.cap@fau.mil.uy', '60000007', ARRAY['CAO', 'CAP']); -- Control de cursos (d)

INSERT INTO usuarios (username, password_hash, estado, aplicacion, persona_id)
SELECT t.username, crypt('FAUdemo1!', gen_salt('bf', 12)), 'activo', 'personal', per.id
FROM tmp_demo_usuarios t
JOIN personas per ON per.cedula = t.cedula
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios u WHERE u.username = t.username AND u.aplicacion = 'personal'
);

INSERT INTO usuarios_unidades (usuario_id, unidad_id)
SELECT u.id, uni.id
FROM tmp_demo_usuarios t
JOIN usuarios u ON u.username = t.username AND u.aplicacion = 'personal'
JOIN unidades uni ON uni.codigo = ANY (t.comandos)
ON CONFLICT DO NOTHING;

-- El supervisor tiene rol directo "Control de cursos" (para que tenga permisos .unidad
-- en los dos comandos, sin depender de la herencia).
INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT u.id, r.id FROM usuarios u
JOIN roles r ON r.nombre = 'Control de cursos' AND r.aplicacion = 'personal'
WHERE u.username = 'supervisor.cao.cap@fau.mil.uy' AND u.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================================
-- RESUMEN DE ESCENARIOS DEMO
-- ============================================================================
--
-- USUARIO                         COMANDOS    ROL                    ALCANCE            QUÉ PUEDE HACER
-- ─────────────────────────────── ─────────── ────────────────────── ────────────────── ─────────────────────────────────────
-- admin@fau.mil.uy                (ninguno)   Administrador          GLOBAL             Todo
-- jefe.personal@fau.mil.uy        (ninguno)   Oficina de Personal    GLOBAL             CRUD completo de todo el personal
-- jefe.cao@fau.mil.uy             CAO         Control de cursos (h)  UNIDAD(CAO)        Ver personal del C.A.O. + gestionar sus cursos
-- jefe.cap@fau.mil.uy             CAP         Control de cursos (h)  UNIDAD(CAP)        Ver personal del C.A.P. + gestionar sus cursos
-- consulta.cg@fau.mil.uy          CG          Consulta (h)           UNIDAD(CG)         Solo ver personal y cursos del C.G.
-- operador.cal@fau.mil.uy         CAL         Operador Personal (h)  UNIDAD(CAL)        CRUD personal del C.A.L. + reportes
-- supervisor.cao.cap@fau.mil.uy   CAO+CAP     Control de cursos (d)  UNIDAD(CAO,CAP)    Ver personal y cursos de AMBOS comandos
--
-- (h) = heredado del comando   (d) = directo
--
-- Funcionarios activos por comando: C.A.O. 19 (B.A.I., B.A.II., B.A.III., C.O.A.),
-- C.A.P. 4 (E.T.A., E.M.A.), C.A.L. 4 (S.ABAST., S. MANT., S.INFRA.), C.G. 1 (D.C.G.).
-- Más 2 de baja en el C.A.O. (60000026 retiro voluntario, 60000027 retiro obligatorio).
--
-- ESCENARIOS CLAVE PARA DEMOSTRAR:
-- 1. jefe.cao NO puede ver personal del C.A.P. ni gestionar sus cursos
-- 2. supervisor.cao.cap SÍ puede ver personal del C.A.O. y del C.A.P. a la vez
-- 3. jefe.personal SÍ puede ver TODO (alcance global)
-- 4. consulta.cg solo puede LEER, no editar nada
-- 5. operador.cal puede crear/editar personas pero solo las del C.A.L.
-- 6. admin puede gestionar usuarios, roles y unidades
-- ============================================================================

-- SEED DEL MÓDULO DE ASCENSOS

BEGIN;

-- Cursos que nombran las reglas de ascenso

-- Van sin unidad: un curso con unidad solo lo ve y lo gestiona esa unidad, y
-- estos son requisito de ascenso para cualquier funcionario de la fuerza.
-- La "Prueba de Suficiencia" se modela como un curso más del catálogo.
INSERT INTO public.cursos (nombre_curso, institucion, es_obligatorio, unidad_id)
SELECT v.nombre, v.institucion, v.obligatorio, NULL
FROM (VALUES
  ('Curso de Pasaje de Grado de Cbo. 2.ª para Cbo. 1.ª (M-02)',
   'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso de Pasaje de Grado de Cbo. 1.ª para Sgto.',
   'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso de Pasaje de Grado de Sgto. para Sgto. 1ro. (M-03)',
   'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso de Formación de Instructores (Nivel 7)',
   'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso de Formación de Supervisores (Nivel 9)',
   'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Elemental de Comando',
   'Escuela de Comando y Estado Mayor Aéreo', TRUE),
  ('Curso Básico de Comando',
   'Escuela de Comando y Estado Mayor Aéreo', TRUE),
  ('Curso de Comando y Estado Mayor Aéreo',
   'Escuela de Comando y Estado Mayor Aéreo', TRUE),
  ('Curso Superior de Comando',
   'Escuela de Comando y Estado Mayor Aéreo', TRUE),
  ('Curso Superior de Defensa Nacional',
   'Centro de Altos Estudios Nacionales',     TRUE),
  ('Prueba de Suficiencia',
   'Fuerza Aérea Uruguaya',                   TRUE)
) AS v(nombre, institucion, obligatorio)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cursos c WHERE c.nombre_curso = v.nombre
);

-- SECCIÓN 2: Reglas de ascenso de la FAU

INSERT INTO public.ascensos_reglas
  (nombre, grado_origen_id, grado_destino_id, dias_minimos, edad_maxima, es_por_defecto, activo)
SELECT v.nombre, go.id, gd.id, v.dias, v.edad, TRUE, v.activo
FROM (VALUES
  ('Sdo. 2.ª → Sdo. 1.ª',   'SDO_2DA',  'SDO_1RA',   182,  44, FALSE),
  ('Sdo. 1.ª → Cbo. 2.ª',   'SDO_1RA',  'CBO_2DA',   365,  44, TRUE),
  ('Cbo. 2.ª → Cbo. 1.ª',   'CBO_2DA',  'CBO_1RA',   730,  47, TRUE),
  ('Cbo. 1.ª → Sgto.',      'CBO_1RA',  'SGTO',      730,  49, TRUE),
  ('Sgto. → Sgto. 1.º',     'SGTO',     'SGTO_1RO',  730,  51, TRUE),
  ('Sgto. 1.º → S.O.M.',    'SGTO_1RO', 'SOM',       730,  54, TRUE),
  ('At. 2.ª → At. 1.ª',     'AT_2DA',   'AT_1RA',    730,  NULL, TRUE),
  ('At. 1.ª → At. Ppal.',   'AT_1RA',   'AT_PPAL',   730,  49, TRUE),
  ('At. Ppal. → Inst. At.', 'AT_PPAL',  'INST_AT',   730,  51, TRUE),
  ('Inst. At. → Sup. At.',  'INST_AT',  'SUP_AT',    730,  54, TRUE),
  ('Alf. → Tte. 2.º',       'ALF',      'TTE_2DO',   730,  NULL, TRUE),
  ('Tte. 2.º → Tte. 1.º',   'TTE_2DO',  'TTE_1RO',  1095,  NULL, TRUE),
  ('Tte. 1.º → Cap.',       'TTE_1RO',  'CAP',      1460,  NULL, TRUE),
  ('Cap. → May.',           'CAP',      'MAY',      1460,  NULL, TRUE),
  ('May. → Tte. Cnel.',     'MAY',      'TTE_CNEL', 1460,  NULL, TRUE),
  ('Tte. Cnel. → Cnel.',    'TTE_CNEL', 'CNEL',     1460,  NULL, TRUE),
  ('Cnel. → Brig. Gral.',   'CNEL',     'BRIG_GRAL', 1825, NULL, TRUE)
) AS v(nombre, origen, destino, dias, edad, activo)
JOIN public.grados go ON go.codigo = v.origen
JOIN public.grados gd ON gd.codigo = v.destino
WHERE NOT EXISTS (
  SELECT 1 FROM public.ascensos_reglas r WHERE r.grado_origen_id = go.id
);

-- Requisitos de cada regla 
--
-- Un requisito que no aplica se marca así en la pantalla y no cuenta como
-- incumplido.

INSERT INTO public.ascensos_reglas_requisitos
  (regla_id, tipo, descripcion, modo, aplica_si, orden)
SELECT r.id, 'CURSO_APROBADO', v.descripcion, 'TODOS', v.aplica_si::text[], v.orden
FROM (VALUES
  ('CBO_2DA',  'Curso de pasaje de grado de Cbo. 2.ª a Cbo. 1.ª (M-02)',            '{ES_MUTADO,NIVEL_LICEAL}', 1),
  ('CBO_1RA',  'Curso de pasaje de grado de Cbo. 1.ª a Sgto.',                      '{SIEMPRE}',                1),
  ('SGTO',     'Curso de pasaje de grado de Sgto. a Sgto. 1.º (M-03)',              '{SIEMPRE}',                1),
  ('SGTO',     'Curso de formación de instructores (nivel 7)',                      '{SIEMPRE}',                2),
  ('SGTO_1RO', 'Curso de formación de supervisores (nivel 9)',                      '{SIEMPRE}',                1),
  ('AT_2DA',   'Curso de pasaje de grado (M-02 o equivalente)',                     '{ES_MUTADO}',              1),
  ('AT_1RA',   'Curso de pasaje de grado (M-02 o equivalente)',                     '{SIEMPRE}',                1),
  ('AT_PPAL',  'Curso de pasaje de grado de Sgto. a Sgto. 1.º o equivalente (M-03)','{SIEMPRE}',                1),
  ('AT_PPAL',  'Curso de formación de instructores (nivel 7)',                      '{SIEMPRE}',                2),
  ('INST_AT',  'Curso de formación de supervisores (nivel 9)',                      '{SIEMPRE}',                1),
  ('TTE_1RO',  'Curso Elemental de Comando',                                        '{SIEMPRE}',                1),
  ('TTE_1RO',  'Prueba de Suficiencia',                                             '{SIEMPRE}',                2),
  ('CAP',      'Curso Básico de Comando',                                           '{SIEMPRE}',                1),
  ('CAP',      'Prueba de Suficiencia',                                             '{SIEMPRE}',                2),
  ('MAY',      'Curso de Comando y Estado Mayor Aéreo',                             '{SIEMPRE}',                1),
  ('MAY',      'Prueba de Suficiencia',                                             '{SIEMPRE}',                2),
  ('TTE_CNEL', 'Curso Superior de Comando',                                         '{SIEMPRE}',                1),
  ('CNEL',     'Curso Superior de Defensa Nacional',                                '{SIEMPRE}',                1)
) AS v(origen, descripcion, aplica_si, orden)
JOIN public.grados go ON go.codigo = v.origen
JOIN public.ascensos_reglas r
  ON r.grado_origen_id = go.id AND r.es_por_defecto AND r.vigente_hasta IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.ascensos_reglas_requisitos q
  WHERE q.regla_id = r.id AND q.descripcion = v.descripcion
);

-- Cursos concretos que satisfacen cada requisito 
--
-- El "o equivalente" del plan de estudios de la ETA es literal: el mismo curso
-- de pasaje sirve para el tramo equivalente del escalafón AT.

INSERT INTO public.ascensos_reglas_requisito_cursos (requisito_id, curso_id)
SELECT q.id, c.id
FROM (VALUES
  ('CBO_2DA',  'Curso de pasaje de grado de Cbo. 2.ª a Cbo. 1.ª (M-02)',            'Curso de Pasaje de Grado de Cbo. 2.ª para Cbo. 1.ª (M-02)'),
  ('CBO_1RA',  'Curso de pasaje de grado de Cbo. 1.ª a Sgto.',                      'Curso de Pasaje de Grado de Cbo. 1.ª para Sgto.'),
  ('SGTO',     'Curso de pasaje de grado de Sgto. a Sgto. 1.º (M-03)',              'Curso de Pasaje de Grado de Sgto. para Sgto. 1ro. (M-03)'),
  ('SGTO',     'Curso de formación de instructores (nivel 7)',                      'Curso de Formación de Instructores (Nivel 7)'),
  ('SGTO_1RO', 'Curso de formación de supervisores (nivel 9)',                      'Curso de Formación de Supervisores (Nivel 9)'),
  ('AT_2DA',   'Curso de pasaje de grado (M-02 o equivalente)',                     'Curso de Pasaje de Grado de Cbo. 2.ª para Cbo. 1.ª (M-02)'),
  ('AT_1RA',   'Curso de pasaje de grado (M-02 o equivalente)',                     'Curso de Pasaje de Grado de Cbo. 2.ª para Cbo. 1.ª (M-02)'),
  ('AT_PPAL',  'Curso de pasaje de grado de Sgto. a Sgto. 1.º o equivalente (M-03)','Curso de Pasaje de Grado de Sgto. para Sgto. 1ro. (M-03)'),
  ('AT_PPAL',  'Curso de formación de instructores (nivel 7)',                      'Curso de Formación de Instructores (Nivel 7)'),
  ('INST_AT',  'Curso de formación de supervisores (nivel 9)',                      'Curso de Formación de Supervisores (Nivel 9)'),
  ('TTE_1RO',  'Curso Elemental de Comando',                                        'Curso Elemental de Comando'),
  ('TTE_1RO',  'Prueba de Suficiencia',                                             'Prueba de Suficiencia'),
  ('CAP',      'Curso Básico de Comando',                                           'Curso Básico de Comando'),
  ('CAP',      'Prueba de Suficiencia',                                             'Prueba de Suficiencia'),
  ('MAY',      'Curso de Comando y Estado Mayor Aéreo',                             'Curso de Comando y Estado Mayor Aéreo'),
  ('MAY',      'Prueba de Suficiencia',                                             'Prueba de Suficiencia'),
  ('TTE_CNEL', 'Curso Superior de Comando',                                         'Curso Superior de Comando'),
  ('CNEL',     'Curso Superior de Defensa Nacional',                                'Curso Superior de Defensa Nacional')
) AS v(origen, descripcion, curso_nombre)
JOIN public.grados go ON go.codigo = v.origen
JOIN public.ascensos_reglas r
  ON r.grado_origen_id = go.id AND r.es_por_defecto AND r.vigente_hasta IS NULL
JOIN public.ascensos_reglas_requisitos q
  ON q.regla_id = r.id AND q.descripcion = v.descripcion
JOIN public.cursos c ON c.nombre_curso = v.curso_nombre
ON CONFLICT (requisito_id, curso_id) DO NOTHING;

COMMIT;
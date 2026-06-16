BEGIN;

INSERT INTO public.cursos (nombre_curso, institucion, es_obligatorio)
SELECT v.nombre_curso, v.institucion, v.es_obligatorio
FROM (VALUES
  ('Curso 1er. Año Común Único "Reclutamiento"',                            'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso 1er. Año Común Único "Técnico Básico"',                           'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 2do. Año "Aviónica (BO)"',                       'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 2do. Año "Célula (BN)"',                         'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 2do. Año "Sistema Motopropulsor (BM)"',          'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 3er. Año "Aviónica (BO)"',                       'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 3er. Año "Célula (BN)"',                         'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Avanzado 3er. Año "Sistema Motopropulsor (BM)"',          'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Básico de 1er. año "Apoyo al Vuelo"',                     'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Básico de 2do. año "Mantenimiento de Equipos y Sistemas"','Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Básico de 2do. año "Comunicación y Navegación"',          'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Básico de 3er. año "Apoyo al Vuelo"',                     'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso Regular Básico de 3er. año "Logística y Abastecimiento"',         'Escuela Técnica de Aeronáutica', TRUE),
  ('Curso de Pasaje de Grado de Sargento para Sargento 1ro. o equivalente (M-03)', 'Escuela Técnica de Aeronáutica', TRUE)
) AS v(nombre_curso, institucion, es_obligatorio)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cursos c WHERE c.nombre_curso = v.nombre_curso
);

COMMIT;

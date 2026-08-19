BEGIN;

INSERT INTO regimenes (numero_ley, denominacion)
VALUES ('LEY19101', 'Régimen Militar')
ON CONFLICT (numero_ley) DO NOTHING;

INSERT INTO unidades (codigo, denominacion)
VALUES ('CG', 'Cuartel General')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO programas (codigo, denominacion)
VALUES ('PROG01', 'Programa General')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO situaciones (codigo, denominacion, sistema_salud)
VALUES ('ACT', 'Actividad', 'ssffaa')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO escalafones (codigo, denominacion)
VALUES ('ST', 'Subalterno Técnico')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO grados (escalafon_id, codigo, denominacion, orden, es_subalterno)
VALUES
  ((SELECT id FROM escalafones WHERE codigo = 'ST'), 'SM',  'Suboficial Mayor',  10, true),
  ((SELECT id FROM escalafones WHERE codigo = 'ST'), 'SP',  'Sargento Primero',  11, true),
  ((SELECT id FROM escalafones WHERE codigo = 'ST'), 'SG',  'Sargento',          12, true),
  ((SELECT id FROM escalafones WHERE codigo = 'ST'), 'C1',  'Cabo Primero',      13, true),
  ((SELECT id FROM escalafones WHERE codigo = 'ST'), 'C2',  'Cabo Segundo',      14, true),
  ((SELECT id FROM escalafones WHERE codigo = 'ST'), 'S1',  'Soldado Primera',   15, true)
ON CONFLICT DO NOTHING;

COMMIT;
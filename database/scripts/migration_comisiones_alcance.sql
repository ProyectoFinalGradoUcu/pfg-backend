-- El catálogo es compartido; el alcance de las pertenencias depende de la persona.
BEGIN;
INSERT INTO permisos(nombre, descripcion, aplicacion) VALUES
  ('comisiones.ver.unidad', 'Consultar pertenencias a comisiones del personal de las propias unidades', 'personal'),
  ('comisiones.gestionar.unidad', 'Gestionar pertenencias a comisiones del personal de las propias unidades', 'personal')
ON CONFLICT (nombre, aplicacion) DO NOTHING;

-- Roles que solo leen personas de unidad no deben conservar lectura global de Comisiones.
WITH acotados AS (
  SELECT r.id FROM roles r WHERE r.aplicacion = 'personal'
    AND EXISTS (SELECT 1 FROM roles_permisos rp JOIN permisos p ON p.id = rp.permiso_id WHERE rp.rol_id = r.id AND p.nombre = 'personas.ver.unidad' AND p.aplicacion = 'personal')
    AND NOT EXISTS (SELECT 1 FROM roles_permisos rp JOIN permisos p ON p.id = rp.permiso_id WHERE rp.rol_id = r.id AND p.nombre = 'personas.ver' AND p.aplicacion = 'personal')
)
INSERT INTO roles_permisos(rol_id, permiso_id)
SELECT rp.rol_id, nuevo.id FROM roles_permisos rp
JOIN acotados a ON a.id = rp.rol_id
JOIN permisos anterior ON anterior.id = rp.permiso_id AND anterior.nombre IN ('comisiones.ver', 'comisiones.gestionar') AND anterior.aplicacion = 'personal'
JOIN permisos nuevo ON nuevo.nombre = anterior.nombre || '.unidad' AND nuevo.aplicacion = 'personal'
ON CONFLICT DO NOTHING;

DELETE FROM roles_permisos rp USING permisos p
WHERE p.id = rp.permiso_id AND p.aplicacion = 'personal' AND p.nombre IN ('comisiones.ver', 'comisiones.gestionar')
  AND EXISTS (SELECT 1 FROM roles_permisos x JOIN permisos px ON px.id = x.permiso_id WHERE x.rol_id = rp.rol_id AND px.nombre = 'personas.ver.unidad' AND px.aplicacion = 'personal')
  AND NOT EXISTS (SELECT 1 FROM roles_permisos x JOIN permisos px ON px.id = x.permiso_id WHERE x.rol_id = rp.rol_id AND px.nombre = 'personas.ver' AND px.aplicacion = 'personal');

INSERT INTO roles_permisos(rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.aplicacion = 'personal' AND p.aplicacion = 'personal'
  AND ((r.nombre = 'Operador de Personal' AND p.nombre IN ('comisiones.ver.unidad', 'comisiones.gestionar.unidad'))
    OR (r.nombre = 'Consulta' AND p.nombre = 'comisiones.ver.unidad'))
ON CONFLICT DO NOTHING;
COMMIT;

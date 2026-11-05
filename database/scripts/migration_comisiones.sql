BEGIN;

CREATE TABLE IF NOT EXISTS public.comisiones (
  id BIGSERIAL PRIMARY KEY,
  denominacion VARCHAR(200) NOT NULL CHECK (length(btrim(denominacion)) > 0),
  vigente BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS uix_comisiones_denominacion ON public.comisiones (lower(btrim(denominacion)));
CREATE TABLE IF NOT EXISTS public.asignaciones_comision (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL REFERENCES public.personas(id),
  comision_id BIGINT NOT NULL REFERENCES public.comisiones(id),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  numero_orden VARCHAR(50),
  boletin VARCHAR(50),
  CONSTRAINT asignaciones_comision_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT asignaciones_comision_documento CHECK (
    coalesce(length(btrim(numero_orden)), 0) > 0 OR coalesce(length(btrim(boletin)), 0) > 0
  )
);
CREATE INDEX IF NOT EXISTS idx_asignaciones_comision_persona ON public.asignaciones_comision(persona_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_comision_comision ON public.asignaciones_comision(comision_id);
CREATE UNIQUE INDEX IF NOT EXISTS uix_asignaciones_comision_abierta
  ON public.asignaciones_comision(persona_id, comision_id) WHERE fecha_fin IS NULL;

INSERT INTO permisos(nombre, descripcion, aplicacion) VALUES
  ('comisiones.ver', 'Consultar comisiones e integrantes', 'personal'),
  ('comisiones.gestionar', 'Gestionar comisiones y asignaciones', 'personal')
ON CONFLICT (nombre, aplicacion) DO NOTHING;
INSERT INTO roles_permisos(rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.aplicacion = 'personal' AND p.aplicacion = 'personal'
  AND ((r.nombre IN ('Administrador del sistema', 'Oficina de Personal') AND p.nombre IN ('comisiones.ver', 'comisiones.gestionar'))
    OR (r.nombre = 'Usuario' AND p.nombre = 'comisiones.ver'))
ON CONFLICT DO NOTHING;
INSERT INTO contextos(nombre, descripcion) VALUES ('Comisiones', 'Gestión de comisiones y sus integrantes')
ON CONFLICT (nombre) DO NOTHING;
COMMIT;

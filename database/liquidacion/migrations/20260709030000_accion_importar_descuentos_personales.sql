-- ============================================================
-- Migración 20260709030000: Acción de auditoría para carga masiva
-- de descuentos personales (.txt de ancho fijo por acreedor).
-- ============================================================

INSERT INTO acciones (nombre, descripcion)
VALUES
    ('ImportarDescuentosPersonales', 'Carga masiva de descuentos personales desde archivo .txt de un acreedor')
ON CONFLICT (nombre) DO NOTHING;

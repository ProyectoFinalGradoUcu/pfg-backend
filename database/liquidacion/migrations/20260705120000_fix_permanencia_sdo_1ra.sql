-- ============================================================
-- Corregir tabla_permanencia para Sdo. 1ª (grado_id=1)
--
-- La migración 20260630143000_completar_tabla_permanencia_oficiales.sql
-- cargó por error los valores de "Soldado 2da." (GR16, T/M=6 meses:
-- 1.064,11 / 2.128,23) en el grado "Soldado 1ra." (GR15, T/M=1 año:
-- 760,08 / 1.520,16).
--
-- Confirmado contra la planilla oficial "PERMANENCIAS EN EL GRADO
-- PERSONAL SUBALTERNO - 041.003" y contra recibo FoxPro real
-- (Mayo 2026, cédula 5118278-2): Permanencia en el Grado = 760.08,
-- mientras que el sistema actual liquidaba 1.064,11 para el mismo
-- funcionario/mes equivalente — inflando en cascada Dedicación
-- Integral (043.004), Mod. Aportes Ley 19.695 (042.413) y los
-- descuentos calculados sobre esa base (DNS FF.AA., Serv. Tutelar,
-- Montepío).
-- ============================================================

UPDATE tabla_permanencia
SET monto_fijo = 760.08
WHERE grado_id = 1 AND aplica_riesgo_vuelo = false AND meses_hasta = 12 AND monto_fijo = 1064.11;

UPDATE tabla_permanencia
SET monto_fijo = 1520.16
WHERE grado_id = 1 AND aplica_riesgo_vuelo = false AND meses_hasta = 24 AND monto_fijo = 2128.23;

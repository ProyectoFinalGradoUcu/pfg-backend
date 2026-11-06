-- ============================================================
-- Completar y corregir tabla_permanencia (adicional 041.003 — Permanencia en el Grado)
--
-- Problema encontrado:
--   1) Solo estaban cargados los grados 1-6 (Sdo. 1ª a S.O.M.), faltando
--      todos los grados de Oficiales (Alf. a Gral. Del Aire) y Sdo. 2ª.
--   2) Para los grados 1-6, los montos con aplica_riesgo_vuelo=false eran en
--      realidad los valores de la planilla "riesgo de vuelo" duplicados en
--      ambos flags (el valor real "sin riesgo de vuelo" nunca se cargó).
--   3) Los tramos (meses_hasta) usaban siempre múltiplos de 12 desde el año 1,
--      ignorando que el T/M (tiempo mínimo para la 1ra cuota) varía por grado
--      (de 6 meses a 5 años) — ver InsumosPeriodo.ObtenerPermanencia, que
--      toma el tramo de mayor meses_hasta que sea <= meses de servicio.
--
-- Fuente: planillas "PERMANENCIAS EN EL GRADO" código 041.003 — tabla general
-- (Oficiales + Personal Subalterno) y tabla "Fuerza Aérea y Armada — para
-- quienes perciben riesgo de vuelo".
--
-- Para grados con dos variantes en la planilla (según pie de página), se usó
-- la variante Fuerza Aérea / MDN-JM (nota (2): "SOLO FUERZA AEREA ART. 101
-- LEY 16.320 DE 01/11/92"), por ser la aplicable a este sistema (FAU).
-- No se encontró valor de riesgo de vuelo para Sdo. 1ª / Sdo. 2ª en la
-- planilla fuente, por lo que no se cargó ese flag para esos dos grados.
--
-- meses_desde se guarda siempre en 0 (igual que la carga previa): el cálculo
-- real (InsumosPeriodo.ObtenerPermanencia) solo usa meses_hasta como umbral.
--
-- Se aplica el mismo monto a todos los escalafones (17), replicando el
-- criterio ya usado en la carga original de los grados 1-6.
-- ============================================================

DELETE FROM tabla_permanencia
WHERE grado_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 25);

INSERT INTO tabla_permanencia (escalafon_id, grado_id, meses_desde, meses_hasta, monto_fijo, aplica_riesgo_vuelo, vigente_desde, activo)
SELECT e.id, v.grado_id, 0, v.meses_hasta, v.monto, v.riesgo, DATE '2026-01-01', true
FROM escalafones e
CROSS JOIN (VALUES
    -- Sdo. 1ª (grado 1) — GR15 Soldado 1era (JM), T/M=1 año
    (1::bigint, false, 12::smallint, 1064.11::numeric),
    (1, false, 24, 2128.23),

    -- Sdo. 2ª (grado 25) — GR16 Soldado 2da, T/M=6 meses
    (25, false, 6, 1064.11),
    (25, false, 18, 2128.23),

    -- Cbo. 2ª (grado 2) — GR14 Cbo.2da (JM), T/M=1 año
    (2, false, 12, 912.10),
    (2, false, 24, 1824.20),
    (2, true, 12, 957.70),
    (2, true, 24, 1915.41),

    -- Cbo. 1ª (grado 3) — GR13 Cbo.1era (JM), T/M=1 año
    (3, false, 12, 1064.11),
    (3, false, 24, 2128.23),
    (3, true, 12, 1117.32),
    (3, true, 24, 2234.64),

    -- Sgto. (grado 4) — GR12 Sargento (1)(4)(JM), T/M=2 años
    (4, false, 24, 1013.44),
    (4, false, 36, 2026.88),
    (4, false, 48, 3040.33),
    (4, true, 12, 1064.11),
    (4, true, 24, 2128.23),
    (4, true, 36, 3192.34),

    -- Sgto. 1° (grado 5) — GR11 Sargento 1ero-S.O.1era (2)(4)(JM), T/M=2 años
    (5, false, 24, 709.41),
    (5, false, 36, 1418.82),
    (5, false, 48, 2128.23),
    (5, true, 24, 744.88),
    (5, true, 36, 1489.76),
    (5, true, 48, 2234.64),

    -- S.O.M. (grado 6) — GR10 S.O.M.-(MDN)-JM(3)(4), T/M=3 años
    (6, false, 36, 1265.54),
    (6, false, 48, 2531.07),
    (6, false, 60, 3796.61),
    (6, false, 72, 5062.14),
    (6, true, 48, 1051.95),
    (6, true, 60, 2103.91),
    (6, true, 72, 3155.86),
    (6, true, 84, 4207.81),
    (6, true, 96, 5259.77),

    -- Alf. (grado 7) — GR09 Alferez-MDN-Y JM, T/M=3 años
    (7, false, 36, 1436.55),
    (7, false, 48, 2873.11),
    (7, false, 60, 4309.66),
    (7, false, 72, 5746.22),
    (7, true, 24, 2006.62),
    (7, true, 36, 4013.23),
    (7, true, 48, 6019.85),

    -- Tte. 2° (grado 8) — GR08 Tte.2do-Tt.2do.MDN-Y JM-A/F, T/M=3 años
    (8, false, 36, 478.85),
    (8, false, 48, 957.70),
    (8, false, 60, 1436.55),
    (8, false, 72, 1915.41),
    (8, true, 36, 501.65),
    (8, true, 48, 1003.31),
    (8, true, 60, 1504.96),
    (8, true, 72, 2006.62),

    -- Tte. 1° (grado 9) — GR07 Tte.1ero. MDN-SM (SM3)(JM), T/M=3 años
    (9, false, 36, 957.70),
    (9, false, 48, 1915.41),
    (9, false, 60, 2873.11),
    (9, false, 72, 3830.81),
    (9, true, 48, 802.65),
    (9, true, 60, 1605.29),
    (9, true, 72, 2407.94),
    (9, true, 84, 3210.58),
    (9, true, 96, 4013.23),

    -- Cap. (grado 10) — GR06 Cap.-T/N-Cap.MDN-Y JM, T/M=4 años
    (10, false, 48, 680.43),
    (10, false, 60, 1360.85),
    (10, false, 72, 2041.28),
    (10, false, 84, 2721.70),
    (10, false, 96, 3402.13),
    (10, true, 48, 704.75),
    (10, true, 60, 1409.50),
    (10, true, 72, 2114.24),
    (10, true, 84, 2818.99),
    (10, true, 96, 3523.74),

    -- May. (grado 11) — GR05 Mayor-Cap.de Corbeta (JM), T/M=4 años
    (11, false, 48, 459.70),
    (11, false, 60, 919.39),
    (11, false, 72, 1379.09),
    (11, false, 84, 1838.79),
    (11, false, 96, 2298.49),
    (11, true, 48, 359.37),
    (11, true, 60, 718.73),
    (11, true, 72, 1078.10),
    (11, true, 84, 1437.47),
    (11, true, 96, 1796.83),

    -- Tte. Cnel. (grado 12) — GR04 Tte.Cnel.-Cap.de Fragata (JM), T/M=4 años
    (12, false, 48, 857.37),
    (12, false, 60, 1714.74),
    (12, false, 72, 2572.12),
    (12, false, 84, 3429.49),
    (12, false, 96, 4286.86),
    (12, true, 48, 877.44),
    (12, true, 60, 1754.88),
    (12, true, 72, 2632.31),
    (12, true, 84, 3509.75),
    (12, true, 96, 4387.19),

    -- Cnel. (grado 13) — GR03 Coronel-Capitan de Navio (2), T/M=5 años
    (13, false, 60, 4581.52),
    (13, false, 72, 9163.04),
    (13, false, 84, 13744.56),
    (13, true, 60, 4624.08),
    (13, true, 72, 9248.17),
    (13, true, 84, 13872.25),

    -- Brig. Gral. (grado 14) — GR02 Gral-C/Almirante-Brig.Gral (1), a partir
    -- del 2do año inclusive; mismo monto con y sin riesgo de vuelo
    (14, false, 24, 3800.41),
    (14, false, 36, 7600.82),
    (14, false, 48, 11401.22),
    (14, false, 60, 15201.63),
    (14, false, 72, 19002.04),
    (14, true, 24, 3800.41),
    (14, true, 36, 7600.82),
    (14, true, 48, 11401.22),
    (14, true, 60, 15201.63),
    (14, true, 72, 19002.04),

    -- Gral. Del Aire (grado 15) — GR01 Comandantes en Jefe, monto fijo sin
    -- escalonamiento (ya en el tope desde el ascenso al grado)
    (15, false, 0, 19002.04),
    (15, true, 0, 19002.04)
) AS v(grado_id, riesgo, meses_hasta, monto);

-- ============================================================
-- Migración 20260709020000: Remuneraciones por grupo (Cuerpo Comando / SS.GG)
--
-- Problema: remuneraciones_grado tenía un único monto por (grado, OG). Pero el
-- Instructivo MDN 2026 ("Anexos Instructivo de Sueldos 2026.xlsx", Hoja 1) fija
-- para 042.536 (PART.LEY 18834 ART) y 048.015 (AUM.LEY 17.269) DOS tarifas
-- distintas por grado, según el cuerpo del funcionario: Cuerpo Comando vs
-- SS.GG. Y Equiparados. El sistema no tenía forma de distinguirlas: siempre
-- devolvía el único valor cargado, sea cual fuera. La migración 20260707130000
-- ya había corregido puntualmente Tte. 2° (grado_id=8) para la reservista
-- cédula 40211677 (escalafón SS.GG.), pero eso dejaba mal a cualquier persona
-- de Cuerpo Comando en el mismo grado.
--
-- Esta migración agrega la columna grupo_remuneracion y carga, para cada grado
-- con ambos valores confirmados en el instructivo, dos filas explícitas
-- ('COMANDO' y 'SSGG') — sin tocar la fila general existente (grupo_remuneracion
-- IS NULL), que sigue siendo el fallback para escalafones no mapeados (AT, RVA,
-- TP, ESP, ESC_3/9/11, ...), tal cual se comportaba antes de este cambio.
--
-- El mapeo escalafón→grupo (AV→COMANDO, SG→SSGG) NO vive en la base — está
-- hardcodeado en InsumosPeriodoLoader.GrupoPorCodigoEscalafon (FAU.Logica), a
-- pedido explícito: es una hipótesis de negocio (nombre de escalafón ≈ columna
-- del instructivo) aceptada para avanzar, no una regla confirmada por MDN.
--
-- Fuera de alcance (pendiente si se confirma que hace falta): 042.103
-- (Compensación Combatientes), 048.042, y la columna ESMADE de 048.015 — el
-- instructivo también las separa por cuerpo, pero no se pidió cubrirlas acá.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('20260709020000', 'agregar_grupo_remuneracion') THEN
        RAISE NOTICE 'Migración 20260709020000 ya ejecutada, saltando.';
        RETURN;
    END IF;

    ALTER TABLE remuneraciones_grado ADD COLUMN IF NOT EXISTS grupo_remuneracion VARCHAR(20);

    -- 042.536 — PART.LEY 18834 ART (Cuerpo Comando / SS.GG.)
    -- (grado_codigo, monto_comando, monto_ssgg)
    WITH datos_042536 (grado_codigo, monto_comando, monto_ssgg) AS (
        VALUES
            ('CNEL',      28452.67, 20758.09),
            ('TTE_CNEL',  19615.76, 14425.51),
            ('MAY',       18239.12, 13663.96),
            ('CAP',       14322.99, 10866.73),
            ('TTE_1RO',   12717.88,  9610.17),
            ('TTE_2DO',   11276.79,  8989.22),
            ('ALF',        4176.81,  2261.22),
            ('SOM',        2706.43,   963.65),
            ('SGTO_1RO',   1362.00,   228.46)
    )
    INSERT INTO remuneraciones_grado (grado_id, item_id, monto, grupo_remuneracion, tipo_monto, vigente_desde)
    SELECT g.id, ci.id, v.monto, v.grupo, 'mensual', DATE '2026-01-01'
    FROM datos_042536 d
    JOIN grados g ON g.codigo = d.grado_codigo
    JOIN catalogo_items ci ON ci.codigo = 42536
    CROSS JOIN LATERAL (VALUES ('COMANDO', d.monto_comando), ('SSGG', d.monto_ssgg)) AS v(grupo, monto)
    WHERE NOT EXISTS (
        SELECT 1 FROM remuneraciones_grado rg
        WHERE rg.grado_id = g.id AND rg.item_id = ci.id AND rg.grupo_remuneracion = v.grupo
    );

    -- 048.015 — AUM.LEY 17.269 (Cuerpo Comando / SS.GG.)
    WITH datos_048015 (grado_codigo, monto_comando, monto_ssgg) AS (
        VALUES
            ('CNEL',      4624.01, 3444.07),
            ('TTE_CNEL',  2901.97, 2168.49),
            ('MAY',       2614.94, 1977.19),
            ('CAP',       2296.06, 1849.61),
            ('TTE_1RO',   2040.91, 1594.46),
            ('TTE_2DO',   1817.69, 1498.81),
            ('ALF',       1562.62, 1307.51),
            ('SOM',       1498.81, 1243.70),
            ('SGTO_1RO',  1275.59, 1116.13),
            ('SGTO',       924.78,  829.13),
            ('CBO_1RA',    841.90,  778.09),
            ('CBO_2DA',    669.68,  650.60)
    )
    INSERT INTO remuneraciones_grado (grado_id, item_id, monto, grupo_remuneracion, tipo_monto, vigente_desde)
    SELECT g.id, ci.id, v.monto, v.grupo, 'mensual', DATE '2026-01-01'
    FROM datos_048015 d
    JOIN grados g ON g.codigo = d.grado_codigo
    JOIN catalogo_items ci ON ci.codigo = 48015
    CROSS JOIN LATERAL (VALUES ('COMANDO', d.monto_comando), ('SSGG', d.monto_ssgg)) AS v(grupo, monto)
    WHERE NOT EXISTS (
        SELECT 1 FROM remuneraciones_grado rg
        WHERE rg.grado_id = g.id AND rg.item_id = ci.id AND rg.grupo_remuneracion = v.grupo
    );

    PERFORM marcar_migracion_exitosa('20260709020000');
END;
$$;

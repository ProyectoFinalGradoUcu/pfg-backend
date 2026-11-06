-- ============================================================
-- Migración: OG 048.018 — Compensación Personal ("COMP PERS #400 Y 250")
--
-- Legacy: CALC_HAB.PRG (código 210, tabla PESOS048.DBF), confirmado además
-- en SUM33101.PRG y ACUM_400.PRG — es un ítem COMÚN a todas las situaciones
-- (no específico de tropa/subalterno), un importe individual por persona
-- cargado a mano, sin fórmula ni dependencia de grado:
--
--   select Pesos048
--   m.codigo_lq = 210
--   seek (str(m.cedula_per,7) + str(m.codigo_lq,4))
--   if found() and import_lq > 0
--       m.codigo = 210
--       m.import_Lq = import_lq
--       do grabo_codigo   -- SDL = vec_cod[3,210] = .t. (siempre entra en la base SDL)
--   endif
--
-- El ítem de catálogo 048.018 (código interno 210) ya existe en catalogo_items
-- (contribuye_w_para_5_3=true, formula_calculo='tabla_externa') — el INSERT de
-- abajo es solo un guard idempotente para entornos donde falte.
-- ============================================================

DO $$
BEGIN
    IF NOT registrar_migracion('20260702170000', 'comp_personal_048018') THEN
        RAISE NOTICE 'Migración 20260702170000 ya ejecutada, saltando.';
        RETURN;
    END IF;

    INSERT INTO catalogo_items (
        codigo, nombre, tipo, es_gravado,
        contribuye_w_para_5_3, contribuye_w_para_10, contribuye_w_para_20, contribuye_w_nominal,
        clasificacion_siif, formula_calculo, orden_calculo, acumula_aguinaldo, lleva_aumento, vigente
    )
    SELECT 210, 'COMP PERS #400 Y 250', 'haber_normal', true,
           true, true, true, true,
           '048.018', 'tabla_externa', 80, false, false, true
    WHERE NOT EXISTS (SELECT 1 FROM catalogo_items WHERE codigo = 210);

    CREATE TABLE IF NOT EXISTS comp_personal_048018 (
        id              bigserial PRIMARY KEY,
        persona_id      bigint NOT NULL REFERENCES personas(id),
        importe         numeric(14,2) NOT NULL,
        estado          varchar(20) NOT NULL DEFAULT 'activo',
        vigente_desde   date NOT NULL,
        vigente_hasta   date,
        creado_por      bigint REFERENCES usuarios(id),
        creado_en       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT ck_comp_personal_048018_importe_positivo CHECK (importe > 0),
        CONSTRAINT ck_comp_personal_048018_estado CHECK (estado IN ('activo', 'anulado'))
    );

    CREATE INDEX IF NOT EXISTS ix_comp_personal_048018_vigencia
        ON comp_personal_048018 (persona_id, estado, vigente_desde);

    INSERT INTO acciones (nombre, descripcion)
    VALUES
        ('CrearCompPersonal', 'Cargar Compensación Personal (048.018) para un funcionario'),
        ('ActualizarCompPersonal', 'Editar el importe de una Compensación Personal (048.018)'),
        ('DarBajaCompPersonal', 'Dar de baja la Compensación Personal (048.018) de un funcionario')
    ON CONFLICT (nombre) DO NOTHING;

    RAISE NOTICE 'comp_personal_048018 creada; catalogo_items 048.018 (cod 210) verificado';

    PERFORM marcar_migracion_exitosa('20260702170000');
END;
$$;

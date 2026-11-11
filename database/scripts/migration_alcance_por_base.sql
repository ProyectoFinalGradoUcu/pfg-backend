-- ─── Alcance por base ──────────────────────────────────────────────────────
--
-- El alcance de los usuarios con permisos `.unidad` y los roles heredados pasan
-- a asignarse por base (sub-unidad: B.A.I., E.T.A., ...) y no por comando.
--
--   usuarios_unidades → usuarios_sub_unidades
--   unidades_roles    → sub_unidades_roles
--
-- Lo que estaba asignado a un comando se copia a todas sus bases, para que nadie
-- pierda ni gane acceso. Después se borran las tablas viejas (son nuestras).
-- En una base nueva las viejas no existen y solo se crean las nuevas.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.usuarios_sub_unidades (
    usuario_id    BIGINT NOT NULL REFERENCES public.usuarios(id),
    sub_unidad_id BIGINT NOT NULL REFERENCES public.sub_unidades(id),
    PRIMARY KEY (usuario_id, sub_unidad_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_sub_unidades_sub_unidad
  ON public.usuarios_sub_unidades (sub_unidad_id);

CREATE TABLE IF NOT EXISTS public.sub_unidades_roles (
    sub_unidad_id BIGINT NOT NULL REFERENCES public.sub_unidades(id),
    rol_id        BIGINT NOT NULL REFERENCES public.roles(id),
    PRIMARY KEY (sub_unidad_id, rol_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_unidades_roles_rol
  ON public.sub_unidades_roles (rol_id);

DO $$
BEGIN
  IF to_regclass('public.usuarios_unidades') IS NOT NULL THEN
    INSERT INTO public.usuarios_sub_unidades (usuario_id, sub_unidad_id)
    SELECT uu.usuario_id, su.id
    FROM public.usuarios_unidades uu
    JOIN public.sub_unidades su ON su.unidad_id = uu.unidad_id
    ON CONFLICT DO NOTHING;

    DROP TABLE public.usuarios_unidades;
  END IF;

  IF to_regclass('public.unidades_roles') IS NOT NULL THEN
    INSERT INTO public.sub_unidades_roles (sub_unidad_id, rol_id)
    SELECT su.id, ur.rol_id
    FROM public.unidades_roles ur
    JOIN public.sub_unidades su ON su.unidad_id = ur.unidad_id
    ON CONFLICT DO NOTHING;

    DROP TABLE public.unidades_roles;
  END IF;
END $$;

-- Todos los filtros de alcance van por la base de la relación laboral vigente.
CREATE INDEX IF NOT EXISTS idx_relaciones_laborales_sub_unidad
  ON public.relaciones_laborales (sub_unidad_id)
  WHERE fecha_fin IS NULL;

COMMIT;

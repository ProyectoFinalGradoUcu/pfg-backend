-- Migración: tablas para invitaciones y reset de contraseña
-- Aplicar con: make migrate-invitaciones

CREATE TABLE IF NOT EXISTS invitaciones (
  id          BIGSERIAL PRIMARY KEY,
  email       VARCHAR(150) NOT NULL,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  persona_id  BIGINT,
  roles       TEXT[] NOT NULL DEFAULT '{}',
  estado      VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  creado_por  BIGINT NOT NULL,
  creado_en   TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  expira_en   TIMESTAMP(6) NOT NULL,
  usado_en    TIMESTAMP(6),
  CONSTRAINT fk_invitaciones_persona    FOREIGN KEY (persona_id) REFERENCES personas(id)  ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT fk_invitaciones_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id)  ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS tokens_reset_password (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  BIGINT NOT NULL,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  usado       BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  expira_en   TIMESTAMP(6) NOT NULL,
  usado_en    TIMESTAMP(6),
  CONSTRAINT fk_tokens_reset_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

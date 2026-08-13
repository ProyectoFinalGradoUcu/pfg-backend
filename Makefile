OS       := $(shell uname -s)
ARCH     := $(shell uname -m)

COMPOSE = docker compose
CTR_CMD = docker

DB_CTR    = postgres
DB_USER   = pfg_user
DB_NAME   = pfg_database
# Migraciones idempotentes, en orden de dependencia. Se aplican siempre que se levanta
# la base: son todas CREATE/ALTER ... IF NOT EXISTS + INSERT ... ON CONFLICT DO NOTHING,
# así que volver a correrlas no hace nada. Agregá acá cualquier migración nueva.
MIGRATIONS = \
	database/scripts/migracion_unificacion_fau.sql \
	database/scripts/migracion_invitaciones_reset.sql \
	database/scripts/migration_misiones_v2.sql \
	database/scripts/migracion_permisos_por_unidad.sql

# ON_ERROR_STOP=1 es importante: sin eso psql termina con código 0 aunque el script falle
# a mitad de camino, y la migración parecería exitosa.
PSQL = $(CTR_CMD) exec -i $(DB_CTR) psql -v ON_ERROR_STOP=1 -U $(DB_USER) -d $(DB_NAME)

SEED      = database/scripts/seed.sql
SEED_AUTH = database/scripts/seed_auth.sql
SEED_DEMO = database/scripts/seed_demo_review.sql
SEED_CURSOS = database/scripts/seed_cursos.sql

.PHONY: up down reset fresh migrate wait-db seed seed-auth seed-demo-review migrate-invitaciones migrate-misiones backend db build logs logs-backend logs-db ps gen-secret help

gen-secret:
	@node -e " \
		const fs = require('fs'); \
		const path = '.env'; \
		const existing = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : ''; \
		if (!existing.includes('JWT_SECRET=')) { \
			fs.appendFileSync(path, 'JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex') + '\n'); \
			console.log('  [ok] JWT_SECRET generado en .env'); \
		} else { \
			console.log('  [skip] JWT_SECRET ya existe en .env'); \
		} \
	"

# `docker compose up -d` vuelve antes de que Postgres acepte conexiones, así que sin esta
# espera el psql de las migraciones falla de forma intermitente.
wait-db:
	@printf "  ... esperando a PostgreSQL"
	@for i in $$(seq 1 30); do \
		if $(CTR_CMD) exec $(DB_CTR) pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; then \
			printf " listo\n"; exit 0; \
		fi; \
		printf "."; sleep 1; \
	done; \
	printf "\n  [error] PostgreSQL no respondió en 30s\n"; exit 1

migrate: wait-db
	@for f in $(MIGRATIONS); do \
		printf "  -> %s\n" "$$f"; \
		$(PSQL) < $$f >/dev/null || exit 1; \
	done
	@echo "  [ok] Migraciones aplicadas"

# Se levanta primero la base, se migra, y recién después arranca el backend: si el backend
# arrancara antes, quedaría corriendo contra un esquema viejo.
up: gen-secret
	$(COMPOSE) up -d postgres minio
	@$(MAKE) --no-print-directory migrate
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

reset: gen-secret
	$(COMPOSE) down -v
	$(COMPOSE) up -d postgres minio
	@$(MAKE) --no-print-directory migrate
	$(COMPOSE) up -d --build

# Alias de reset: destruye los datos y relanza desde cero.
fresh: reset

db:
	$(COMPOSE) up -d postgres
	@$(MAKE) --no-print-directory migrate

backend:
	$(COMPOSE) up -d --build backend

seed:
	$(CTR_CMD) exec -i $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) < $(SEED)

seed-auth:
	$(CTR_CMD) exec -i $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) < $(SEED_AUTH)

seed-demo-review:
	$(CTR_CMD) exec -i $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) < $(SEED_DEMO)

migrate-invitaciones:
	$(CTR_CMD) exec -i $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) < database/scripts/migracion_invitaciones_reset.sql
	@echo "  [ok] Tablas invitaciones y tokens_reset_password creadas"

migrate-misiones:
	$(CTR_CMD) exec -i $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) < database/scripts/migration_misiones_v2.sql
	@echo "  [ok] Tablas convocatorias y funcionarios_convocatorias creadas"

build:
	$(COMPOSE) build

logs:
	$(COMPOSE) logs -f

logs-backend:
	$(COMPOSE) logs -f backend

logs-db:
	$(COMPOSE) logs -f postgres

ps:
	$(COMPOSE) ps

help:
	@echo ""
	@echo "  Comandos disponibles"
	@echo "  ────────────────────────────────────────────────"
	@echo "  make up           Levanta toda la infraestructura (build + start)"
	@echo "  make down         Detiene y elimina contenedores (conserva datos)"
	@echo "  make reset        Destruye todo (datos incluidos) y relanza desde cero"
	@echo "  make fresh        Alias de reset"
	@echo "  make migrate      Aplica todas las migraciones (idempotente, se puede repetir)"
	@echo "  make db           Levanta solo PostgreSQL y aplica las migraciones"
	@echo "  make backend      Levanta (o reinicia) solo el backend"
	@echo "  make seed         Ejecuta el seed de catálogos en la base de datos"
	@echo "  make seed-auth    Ejecuta el seed de seguridad (permisos, roles, admin)"
	@echo "  make seed-demo-review  Carga datos de demo (misiones, cursos, personas) para pruebas"
	@echo "  make seed-cursos  Carga los cursos del Plan de Estudios de la ETA (año 2026)"
	@echo "  make build        Construye imágenes sin levantar servicios"
	@echo "  make logs         Logs de todos los servicios"
	@echo "  make logs-backend Logs solo del backend"
	@echo "  make logs-db      Logs solo de la base de datos"
	@echo "  make ps           Estado de los contenedores"
	@echo ""

.DEFAULT_GOAL := help

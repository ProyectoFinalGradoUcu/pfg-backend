OS       := $(shell uname -s)
ARCH     := $(shell uname -m)

COMPOSE = docker compose
CTR_CMD = docker

DB_CTR    = postgres
DB_USER   = pfg_user
DB_NAME   = pfg_database

# La base se arma igual que en la integración:
#   1. db-init.sql de liquidación      (init del contenedor postgres)
#   2. sus migraciones, con su runner   (servicio liquidacion-migraciones)
#   3. nuestro paquete                  (servicio paquete-personal = database/aplicar-paquete-personal.sh)
#   4. seed_demo.sql                    (solo local)
# 2 y 3 son idempotentes: se corren cada vez que se levanta la base.
TOOLS = $(COMPOSE) --profile tools run --rm

# ON_ERROR_STOP=1 es importante: sin eso psql termina con código 0 aunque el script falle
# a mitad de camino, y la migración parecería exitosa.
PSQL = $(CTR_CMD) exec -i $(DB_CTR) psql -v ON_ERROR_STOP=1 -U $(DB_USER) -d $(DB_NAME)

SEED      = database/scripts/seed_integracion_personal.sql
SEED_DEMO = database/scripts/seed_demo.sql

.PHONY: up down reset fresh liquidacion verificar-base paquete migrate wait-db seed seed-demo migrate-ascensos seed-ascensos db backend build logs logs-backend logs-db ps gen-secret help

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
# espera el psql de las migraciones falla de forma intermitente. Se pregunta por TCP
# (-h 127.0.0.1): mientras corre db-init.sql postgres solo escucha por socket, y por
# socket diría "listo" con el init a medias. Con volumen nuevo el init tarda: hasta 90s.
wait-db:
	@printf "  ... esperando a PostgreSQL"
	@for i in $$(seq 1 90); do \
		if $(CTR_CMD) exec $(DB_CTR) pg_isready -h 127.0.0.1 -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; then \
			printf " listo\n"; exit 0; \
		fi; \
		printf "."; sleep 1; \
	done; \
	printf "\n  [error] PostgreSQL no respondió en 90s\n"; exit 1

# Base de liquidación: db-init.sql (init) + sus migraciones con su runner. Idempotente.
liquidacion:
	$(COMPOSE) up -d postgres
	@$(MAKE) --no-print-directory wait-db
	@$(MAKE) --no-print-directory verificar-base
	$(TOOLS) liquidacion-migraciones

# Un volumen creado con la cadena vieja (legacy/schema.sql + seed_demo) tiene nuestras tablas
# pero ninguna migración de liquidación registrada. Correrle sus migraciones encima le
# aplicaría su lógica (limpiezas, correcciones de catálogo) a datos que no son los de ellos:
# hay que recrearlo con `make reset`.
verificar-base:
	@vieja=$$($(CTR_CMD) exec $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) -tAc \
		"SELECT to_regclass('public.misiones') IS NOT NULL AND (SELECT count(*) FROM schema_migrations) = 0"); \
	if [ "$$vieja" = "t" ]; then \
		echo "  [error] La base local se creó con la cadena vieja (antes de usar la base de liquidación)."; \
		echo "          Recreala con: make reset   (borra los datos locales)"; \
		exit 1; \
	fi

# Nuestro paquete encima de la base actual. Es el mismo comando que se corre en la
# integración. Correrlo dos veces no tiene que cambiar nada.
paquete:
	@$(MAKE) --no-print-directory wait-db
	$(TOOLS) paquete-personal

# Alias de paquete (nombre viejo).
migrate: paquete

# Levanta sin borrar datos. Aplica lo que falte de liquidación y del paquete (los dos son
# idempotentes) y recién después arranca el backend. No carga la demo.
up: gen-secret
	$(COMPOSE) up -d postgres minio
	@$(MAKE) --no-print-directory liquidacion
	@$(MAKE) --no-print-directory paquete
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

# Desde cero, igual que la integración: liquidación -> paquete -> demo -> backend.
reset: gen-secret
	$(COMPOSE) down -v
	$(COMPOSE) up -d postgres minio
	@$(MAKE) --no-print-directory liquidacion
	@$(MAKE) --no-print-directory paquete
	@$(MAKE) --no-print-directory seed-demo
	$(COMPOSE) up -d --build

# Alias de reset: destruye los datos y relanza desde cero.
fresh: reset

# liquidacion + paquete, sin backend.
db:
	@$(MAKE) --no-print-directory liquidacion
	@$(MAKE) --no-print-directory paquete

backend:
	$(COMPOSE) up -d --build backend

seed:
	$(PSQL) < $(SEED)

seed-demo:
	@printf "  -> %s\n" "$(SEED_DEMO)"
	@$(PSQL) -q < $(SEED_DEMO) >/dev/null
	@echo "  [ok] Datos de demo cargados"

migrate-invitaciones:
	@echo "  [skip] Ya incluida en migracion_integracion_personal.sql"

migrate-misiones:
	@echo "  [skip] Ya incluida en migracion_integracion_personal.sql"

migrate-ascensos:
	$(PSQL) < database/scripts/migration_ascensos.sql
	$(PSQL) < database/scripts/migration_ascensos_v2.sql
	@echo "  [ok] Tablas del modulo de ascensos creadas"

seed-ascensos:
	$(PSQL) < database/scripts/seed_ascensos.sql
	@echo "  [ok] Cursos y reglas de ascenso de la FAU cargados"

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
	@echo "  make reset        Desde cero: base de liquidación + paquete + demo + backend"
	@echo "  make fresh        Alias de reset"
	@echo "  make up           Levanta sin borrar datos (aplica lo pendiente, sin demo)"
	@echo "  make down         Detiene y elimina contenedores (conserva datos)"
	@echo "  make liquidacion  Solo la base de liquidación (db-init + sus migraciones)"
	@echo "  make paquete      Aplica nuestro paquete encima (el comando de la integración)"
	@echo "  make migrate      Alias de paquete"
	@echo "  make db           liquidacion + paquete, sin backend"
	@echo "  make backend      Levanta (o reinicia) solo el backend"
	@echo "  make seed         Ejecuta el seed de producción (permisos, roles, admin)"
	@echo "  make seed-demo    Carga datos de demo (30+ personas, 8 usuarios, misiones)"
	@echo "  make migrate-ascensos  Crea las tablas del modulo de ascensos (idempotente)"
	@echo "  make seed-ascensos     Carga los cursos y las reglas de ascenso de la FAU"
	@echo "  make build        Construye imágenes sin levantar servicios"
	@echo "  make logs         Logs de todos los servicios"
	@echo "  make logs-backend Logs solo del backend"
	@echo "  make logs-db      Logs solo de la base de datos"
	@echo "  make ps           Estado de los contenedores"
	@echo ""

.DEFAULT_GOAL := help

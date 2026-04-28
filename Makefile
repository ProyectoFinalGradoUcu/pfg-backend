OS       := $(shell uname -s)
ARCH     := $(shell uname -m)

ifeq ($(OS),Darwin)
	ifeq ($(ARCH),arm64)
		COMPOSE = podman compose
		CTR_CMD = podman
	else
		COMPOSE = docker-compose
		CTR_CMD = docker
	endif
else
	COMPOSE = docker-compose
	CTR_CMD = docker
endif

DB_CTR   = postgres
DB_USER  = pfg_user
DB_NAME  = pfg_database
SEED     = database/scripts/seed.sql

.PHONY: up down reset seed backend db build logs logs-backend logs-db ps gen-secret help

# ──────────────────────────────────────────────── Infraestructura completa ────────────────────────────────────────────────

## Genera un JWT_SECRET aleatorio y lo persiste en .env
gen-secret:
	@echo "JWT_SECRET=$$(openssl rand -hex 32)" > .env
	@echo "  [ok] JWT_SECRET generado en .env"

## Levanta toda la infraestructura desde cero (build + start)
up: gen-secret
	$(COMPOSE) up -d --build

## Detiene y elimina contenedores (conserva volúmenes)
down:
	$(COMPOSE) down

## Destruye todo (contenedores + volúmenes) y vuelve a levantar desde cero
reset: gen-secret
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build

# ─────────────────────────────────────────────────── Servicios individuales ───────────────────────────────────────────────────

## Levanta solo la base de datos
db:
	$(COMPOSE) up -d postgres

## Levanta solo el backend, levanta la DB si no está corriendo
backend:
	$(COMPOSE) up -d --build backend

# ──────────────────────────────────────────────────────────── Base de datos ────────────────────────────────────────────────────────────

## Ejecuta el seed contra la base de datos en ejecución
seed:
	$(CTR_CMD) exec -i $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) < $(SEED)

# ─────────────────────────────────────────────────────────────── Utilidades ───────────────────────────────────────────────────────────────

## Construye las imágenes sin levantar los servicios
build:
	$(COMPOSE) build

## Muestra los logs de todos los servicios (Ctrl+C para salir)
logs:
	$(COMPOSE) logs -f

## Muestra los logs solo del backend
logs-backend:
	$(COMPOSE) logs -f backend

## Muestra los logs solo de la base de datos
logs-db:
	$(COMPOSE) logs -f postgres

## Estado de los contenedores
ps:
	$(COMPOSE) ps

## Muestra este menú de ayuda
help:
	@echo ""
	@echo "  Comandos disponibles"
	@echo "  ────────────────────────────────────────────────"
	@echo "  make up           Levanta toda la infraestructura (build + start)"
	@echo "  make down         Detiene y elimina contenedores (conserva datos)"
	@echo "  make reset        Destruye todo (datos incluidos) y relanza desde cero"
	@echo "  make db           Levanta solo PostgreSQL"
	@echo "  make backend      Levanta (o reinicia) solo el backend"
	@echo "  make seed         Ejecuta el seed SQL en la base de datos"
	@echo "  make build        Construye imágenes sin levantar servicios"
	@echo "  make logs         Logs de todos los servicios"
	@echo "  make logs-backend Logs solo del backend"
	@echo "  make logs-db      Logs solo de la base de datos"
	@echo "  make ps           Estado de los contenedores"
	@echo ""

.DEFAULT_GOAL := help

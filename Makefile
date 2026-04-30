COMPOSE   = docker-compose
DB_CTR    = postgres
DB_USER   = pfg_user
DB_NAME   = pfg_database
SEED      = database/scripts/seed.sql
SEED_AUTH = database/scripts/seed_auth.sql

.PHONY: up down reset seed seed-auth backend db build logs logs-backend logs-db ps gen-secret help

gen-secret:
	@node -e "require('fs').writeFileSync('.env', 'JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex') + '\n')"
	@echo "  [ok] JWT_SECRET generado en .env"

up: gen-secret
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

reset: gen-secret
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build

db:
	$(COMPOSE) up -d postgres

backend:
	$(COMPOSE) up -d --build backend

seed:
	docker exec -i $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) < $(SEED)

seed-auth:
	docker exec -i $(DB_CTR) psql -U $(DB_USER) -d $(DB_NAME) < $(SEED_AUTH)

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
	@echo "  make db           Levanta solo PostgreSQL"
	@echo "  make backend      Levanta (o reinicia) solo el backend"
	@echo "  make seed         Ejecuta el seed de catálogos en la base de datos"
	@echo "  make seed-auth    Ejecuta el seed de seguridad (permisos, roles, admin)"
	@echo "  make build        Construye imágenes sin levantar servicios"
	@echo "  make logs         Logs de todos los servicios"
	@echo "  make logs-backend Logs solo del backend"
	@echo "  make logs-db      Logs solo de la base de datos"
	@echo "  make ps           Estado de los contenedores"
	@echo ""

.DEFAULT_GOAL := help

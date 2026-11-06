# PFG Backend — Guía rápida

## Requisitos

- [Docker](https://www.docker.com/)
- [Make](https://www.gnu.org/software/make/) (en Windows se puede instalar via [Chocolatey](https://chocolatey.org/): `choco install make`)

## La base de datos

La base es la del sistema de liquidación, y lo nuestro va encima. En local se arma igual que
el día de la integración:

1. `database/liquidacion/db-init.sql`: su esquema y sus catálogos (copia sin tocar, ver su `LEEME.md`).
2. Sus migraciones, con su runner.
3. **Nuestro paquete**: `database/paquete-personal.txt`, aplicado por `database/aplicar-paquete-personal.sh`.
4. Solo en local: `database/scripts/seed_demo.sql` (usuarios demo, contraseña `FAUdemo1!`).

Sobre la base real de liquidación se corre **solo el paso 3**, con las mismas variables que su runner:

```bash
DB_HOST=<host> DB_PORT=5432 DB_NAME=fau_liquidacion DB_USER=fau_user DB_PASSWORD=<clave> \
  sh database/aplicar-paquete-personal.sh
```

Si tu base local es de antes de este cambio, `make up` lo detecta y pide `make reset`.

## Comandos

| Comando | Descripción |
|---|---|
| `make reset` | Desde cero: base de liquidación + paquete + demo + backend (borra los datos locales) |
| `make up` | Levanta sin borrar datos; aplica lo pendiente de liquidación y del paquete, sin demo |
| `make down` | Detiene y elimina los contenedores (conserva los datos) |
| `make liquidacion` | Solo la base de liquidación (db-init + sus migraciones) |
| `make paquete` | Aplica nuestro paquete sobre la base actual (idempotente) |
| `make backend` | Levanta o reinicia solo el backend |
| `make db` | `liquidacion` + `paquete`, sin backend |
| `make seed-demo` | Carga los datos de demo |
| `make build` | Construye las imágenes sin levantar servicios |
| `make logs` | Logs en vivo de todos los servicios |
| `make logs-backend` | Logs en vivo solo del backend |
| `make logs-db` | Logs en vivo solo de la base de datos |
| `make ps` | Estado de los contenedores |

## Servicios

- `postgres`: base de datos PostgreSQL en el puerto `5434` del host.
- `backend`: API REST en `http://localhost:3000`.
- Documentación Swagger: `http://localhost:3000/api/docs`.

## Desarrollo local (sin Docker)

```bash
cd backend

# Instalar dependencias
npm install

# Generar el cliente de Prisma
npx prisma generate

# Correr tests
npm test
```

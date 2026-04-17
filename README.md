# PFG Backend — Guía rápida

## Requisitos

- [Docker](https://www.docker.com/)
- [Make](https://www.gnu.org/software/make/) (en Windows se puede instalar via [Chocolatey](https://chocolatey.org/): `choco install make`)

## Comandos

| Comando | Descripción |
|---|---|
| `make up` | Genera un JWT secret aleatorio y levanta toda la infraestructura |
| `make down` | Detiene y elimina los contenedores (conserva los datos) |
| `make reset` | Destruye todo (contenedores + datos) y vuelve a levantar desde cero |
| `make backend` | Levanta o reinicia solo el backend |
| `make db` | Levanta solo PostgreSQL |
| `make seed` | Ejecuta el seed SQL en la base de datos |
| `make build` | Construye las imágenes sin levantar servicios |
| `make logs` | Logs en vivo de todos los servicios |
| `make logs-backend` | Logs en vivo solo del backend |
| `make logs-db` | Logs en vivo solo de la base de datos |
| `make ps` | Estado de los contenedores |

## Servicios

- `postgres`: base de datos PostgreSQL en el puerto `5432`.
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

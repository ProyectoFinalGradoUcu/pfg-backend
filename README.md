# PFG Backend — Guía rápida

## Levantar todo con Docker (recomendado) y comandos útiles

```bash
# desde la raíz del repo
docker compose up --build

# si se quiere borrar
docker compose down -v

# logs en vivo del backend
docker compose logs -f backend

# Luego debemos entrar al backend
cd backend

# Instalar dependencias
npm install

# Lee la DB actual
npx prisma db pull

# Debemos generar el cliente de Prisma
npx prisma generate

# Correr tests (hay que pararse dentro de la carpeta backend)
npm test
```

- `postgres`: crea el contenedor de la base de datos (puerto 5432).
- `backend`: construye la imagen usando `backend/Dockerfile`, corre migraciones Prisma y expone el API en `http://localhost:3000`.
- No necesitas ejecutar `npm install` en tu máquina si usas Docker: el `Dockerfile` ya corre `npm install` dentro de la imagen cada vez que haces `docker compose up --build`.

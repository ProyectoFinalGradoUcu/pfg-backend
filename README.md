# PFG Backend — Guía rápida

## Levantar todo con Docker (recomendado)

```bash
# desde la raíz del repo
docker compose up --build

# logs en vivo del backend
docker compose logs -f backend
```

- `postgres`: crea el contenedor de la base de datos (puerto 5432).
- `backend`: construye la imagen usando `backend/Dockerfile`, corre migraciones Prisma y expone el API en `http://localhost:3000`.
- No necesitas ejecutar `npm install` en tu máquina si usas Docker: el `Dockerfile` ya corre `npm install` dentro de la imagen cada vez que haces `docker compose up --build`.

### Cuándo reconstruir la imagen
- Si cambiaste dependencias en `backend/package.json` → `docker compose build backend` para reinstalar.
- Si hiciste cambios de código → `docker compose up --build backend` o `docker compose up --build` (reconstruye y levanta todo).


## Desarrollar sin Docker (para ver cambios sin tener que reconstruir)

```bash
cd backend
npm install   
npm run start:dev
```

- Aquí sí debes ejecutar `npm install` porque estás corriendo la app directamente con Node en tu entorno local.

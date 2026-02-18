#!/bin/sh
set -e

# Si `DATABASE_URL` está definido, intenta generar el cliente y desplegar migraciones
# (los errores se ignoran para no bloquear el arranque en entornos donde no hay migraciones)
if [ -n "$DATABASE_URL" ]; then
  npx prisma generate || true
  npx prisma migrate deploy || true
fi

exec "$@"

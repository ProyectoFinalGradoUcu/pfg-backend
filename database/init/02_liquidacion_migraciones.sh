# Init de Postgres (docker-entrypoint-initdb.d), SOLO con el volumen vacío:
# aplica las migraciones de liquidación con SU runner, encima de su db-init.sql (01).
#
# Lo usa deploy/docker-compose.prod.yml. Montajes que espera:
#   /liquidacion/run-migrations-pg.sh   (database/liquidacion/run-migrations-pg.sh)
#   /migrations                         (database/liquidacion/migrations; el runner lo tiene fijo)
#
# El entrypoint hace `source` de este archivo (se monta :ro, sin permiso de ejecución):
# nada de `set -e` ni de `exit` salvo para cortar el init. Durante el init postgres
# escucha solo por socket, por eso DB_HOST es el directorio del socket.

echo "== Migraciones de liquidación (init)"
if ! DB_HOST=/var/run/postgresql DB_PORT=5432 \
     DB_NAME="$POSTGRES_DB" DB_USER="$POSTGRES_USER" DB_PASSWORD="$POSTGRES_PASSWORD" \
     sh /liquidacion/run-migrations-pg.sh; then
  echo "[error] fallaron las migraciones de liquidación: se corta el init" >&2
  exit 1
fi

# Init de Postgres (docker-entrypoint-initdb.d), SOLO con el volumen vacío:
# aplica el paquete de Personal encima de la base de liquidación (01 + 02), con el
# mismo script que se corre en la integración. No carga datos de demo.
#
# Lo usa deploy/docker-compose.prod.yml. Montaje que espera:
#   /database   (la carpeta database/ del repo)
#
# El entrypoint hace `source` de este archivo: nada de `set -e` ni de `exit` salvo para
# cortar el init. Durante el init postgres escucha solo por socket.

echo "== Paquete de Personal (init)"
if ! DB_HOST=/var/run/postgresql DB_PORT=5432 \
     DB_NAME="$POSTGRES_DB" DB_USER="$POSTGRES_USER" DB_PASSWORD="$POSTGRES_PASSWORD" \
     sh /database/aplicar-paquete-personal.sh; then
  echo "[error] falló el paquete de Personal: se corta el init" >&2
  exit 1
fi

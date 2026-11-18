#!/bin/sh
#
# Aplica el paquete de Personal encima de una base de liquidación que ya existe.
#
# Es EL comando de la integración: el mismo que corre `make reset` en local y el que se
# corre allá sobre la base real de liquidación. Usa las mismas variables que su runner
# (scripts/run-migrations-pg.sh), así que se configura igual:
#
#   DB_HOST=<host> DB_PORT=5432 DB_NAME=fau_liquidacion DB_USER=fau_user DB_PASSWORD=<clave> \
#     sh database/aplicar-paquete-personal.sh
#
# Sin psql instalado, con Docker:
#
#   docker run --rm --network host -v "$PWD/database:/database:ro" \
#     -e DB_HOST=<host> -e DB_PORT=5432 -e DB_NAME=fau_liquidacion \
#     -e DB_USER=fau_user -e DB_PASSWORD=<clave> \
#     postgres:16-alpine sh /database/aplicar-paquete-personal.sh
#
# Lee la lista de database/paquete-personal.txt y aplica cada script con
# ON_ERROR_STOP=1. Corta en el primer error. Todos los scripts son idempotentes:
# correrlo dos veces no cambia nada la segunda.

set -eu

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-fau_liquidacion}"
DB_USER="${DB_USER:-fau_user}"
export PGPASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"

DIR="$(cd "$(dirname "$0")" && pwd)"
LISTA="$DIR/paquete-personal.txt"

psql_base() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
       -v ON_ERROR_STOP=1 -X -q -P pager=off "$@"
}

[ -f "$LISTA" ] || { echo "[error] falta $LISTA" >&2; exit 1; }

echo "== Paquete de Personal -> $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"

if ! psql_base -tAc "SELECT 1" >/dev/null 2>&1; then
  echo "[error] no se pudo conectar a la base" >&2
  exit 1
fi

# El paquete va ENCIMA de liquidación: si la base no es de liquidación, no se toca.
es_liquidacion=$(psql_base -tAc "SELECT to_regclass('public.schema_migrations') IS NOT NULL
                                    AND to_regclass('public.sub_unidades') IS NOT NULL
                                    AND to_regclass('public.relaciones_laborales') IS NOT NULL")
if [ "$es_liquidacion" != "t" ]; then
  echo "[error] la base no tiene el esquema de liquidación (schema_migrations, sub_unidades," >&2
  echo "        relaciones_laborales). Primero hay que levantar la base de liquidación." >&2
  exit 1
fi

pendientes_liq=$(psql_base -tAc "SELECT count(*) FROM schema_migrations WHERE estado <> 'SUCCESS'")
if [ "$pendientes_liq" != "0" ]; then
  echo "[error] liquidación tiene $pendientes_liq migración(es) sin terminar en schema_migrations." >&2
  exit 1
fi

aplicados=0
# tr -d '\r': la lista puede venir con finales CRLF desde Windows.
tr -d '\r' < "$LISTA" | {
  while IFS= read -r linea || [ -n "$linea" ]; do
    linea=$(echo "$linea" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    case "$linea" in ''|\#*) continue ;; esac

    f="$DIR/$linea"
    if [ ! -f "$f" ]; then
      echo "[error] falta $f" >&2
      exit 1
    fi

    echo "-> $linea"
    if ! psql_base -f "$f"; then
      echo "[error] falló $linea. Se cortó acá; lo anterior quedó aplicado." >&2
      exit 1
    fi
    aplicados=$((aplicados + 1))
  done
  echo "[ok] $aplicados script(s) aplicados"
}

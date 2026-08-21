#!/usr/bin/env bash
#
# Aplica deploy/migrations.txt sobre una base que ya existe. Los scripts de
# docker-entrypoint-initdb.d solo corren con el volumen vacio, asi que sin esto un
# cambio de esquema no llega nunca a produccion.
#
# Se ejecuta desde ~/pfg en la VM, donde estan el compose y el .env.

set -euo pipefail

# En la VM el repo cuelga de src/. MIGRATE_REPO lo cambia para correrlo desde la raiz.
REPO="${MIGRATE_REPO:-src}"
LISTA="$REPO/deploy/migrations.txt"

[ -f "$LISTA" ] || { echo "falta $LISTA" >&2; exit 1; }

if [ -f ./.env ]; then
  set -a
  . ./.env
  set +a
fi

aplicadas=0
while read -r linea; do
  [ -z "$linea" ] && continue
  case "$linea" in \#*) continue ;; esac

  f="$REPO/$linea"
  if [ ! -f "$f" ]; then
    echo "falta $f" >&2
    exit 1
  fi
  echo "-> $f"
  # ON_ERROR_STOP=1: sin eso psql termina en 0 aunque el script falle a la mitad.
  docker compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$f"
  aplicadas=$((aplicadas + 1))
done < "$LISTA"

echo "[ok] $aplicadas migracion(es) aplicada(s)"

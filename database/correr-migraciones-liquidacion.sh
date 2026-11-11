#!/bin/sh
#
# Corre las migraciones de liquidación con SU runner, tal cual vienen en
# database/liquidacion/migraciones.tar.gz (migrations/ + run-migrations-pg.sh).
#
# Los archivos de liquidación se guardan comprimidos para no sumar sus ~9.700 líneas al
# repo. El runner busca las migraciones en /migrations (ruta fija): se descomprimen en un
# directorio temporal y lo único que se le cambia es esa ruta.
#
# Se configura con las mismas variables que el runner: DB_HOST, DB_PORT, DB_NAME, DB_USER,
# DB_PASSWORD. Lo usan el servicio liquidacion-migraciones del compose local y el init de
# prod (database/init/02_liquidacion_migraciones.sh).

set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

tar -xzf "$DIR/liquidacion/migraciones.tar.gz" -C "$TMP"
sed "s#^MIGRATIONS_DIR=.*#MIGRATIONS_DIR=\"$TMP/migrations\"#" "$TMP/run-migrations-pg.sh" > "$TMP/runner.sh"

sh "$TMP/runner.sh"

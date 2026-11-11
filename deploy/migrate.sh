#!/usr/bin/env bash
#
# Aplica el paquete de Personal (database/paquete-personal.txt) sobre la base de la VM.
# Los scripts de docker-entrypoint-initdb.d solo corren con el volumen vacío, así que sin
# esto un cambio de esquema no llega nunca a producción.
#
# Usa el mismo script que se corre sobre la base de liquidación en la integración
# (database/aplicar-paquete-personal.sh), a través del servicio `paquete-personal` del
# compose. Se ejecuta desde ~/pfg en la VM, donde están el compose y el .env.

set -euo pipefail

docker compose --profile tools run --rm paquete-personal

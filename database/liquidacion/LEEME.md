# Base de liquidación (copia sin modificar)

Estos archivos son del repo del equipo de liquidación (`Sistema.Liquidacion.BE`). **No se editan.**
Si ellos cambian algo, se vuelven a copiar enteros.

| Archivo | Qué es |
|---|---|
| `db-init.sql` | Su esquema con catálogos: 4 unidades (CAO, CAP, CAL, CG), 18 sub-unidades, grados, escalafones, situaciones, etc. Sin personas ni usuarios. |
| `migrations/*.sql` | Sus 21 migraciones. Se controlan con la tabla `schema_migrations`. |
| `run-migrations-pg.sh` | Su runner. Aplica las migraciones pendientes de `/migrations`. |

**Origen:** zip `Sistema.Liquidacion.BE-master` (copia del 2026-09-06), tomado como versión final.
Última migración: `20260709030000_accion_importar_descuentos_personales.sql`.

## Para qué están acá

En local levantamos una base **idéntica a la que ya tiene liquidación** y encima aplicamos nuestro paquete,
igual que se va a hacer el día de la integración:

1. `db-init.sql` (init del contenedor `postgres`)
2. sus migraciones, con su runner (`docker compose run --rm liquidacion-migraciones`)
3. nuestro paquete (`database/aplicar-paquete-personal.sh`)
4. la demo (`seed_demo.sql`, solo local)

`make liquidacion` hace 1 y 2; `make reset` hace todo.

## Cómo actualizarlo

Copiar de nuevo `scripts/db-init.sql`, `scripts/run-migrations-pg.sh` y `scripts/migrations/` de su repo,
actualizar la fecha y la última migración de arriba, y correr `make reset`.

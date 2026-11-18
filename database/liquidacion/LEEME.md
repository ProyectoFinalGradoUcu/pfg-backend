# Base de liquidación (copia sin modificar, comprimida)

Estos archivos son del repo del equipo de liquidación (`Sistema.Liquidacion.BE`). **No se editan.**
Si ellos cambian algo, se vuelven a copiar enteros.

Van **comprimidos** para no sumar al repo las ~9.700 líneas de otro equipo:

| Archivo | Qué tiene |
|---|---|
| `db-init.sql.gz` | Su `scripts/db-init.sql`: esquema con catálogos. Trae 4 unidades (CAO, CAP, CAL, CG), 18 sub-unidades, grados, escalafones, situaciones, etc., sin personas ni usuarios. Postgres ejecuta los `.sql.gz` del init directamente. |
| `migraciones.tar.gz` | Su `scripts/migrations/` (21 migraciones, controladas con `schema_migrations`) y su runner `scripts/run-migrations-pg.sh`. Lo descomprime y corre `database/correr-migraciones-liquidacion.sh`. |

**Origen:** zip `Sistema.Liquidacion.BE-master` (copia del 2026-09-06), tomado como versión final.
Última migración: `20260709030000_accion_importar_descuentos_personales.sql`.

## Para qué están acá

En local levantamos una base **idéntica a la que ya tiene liquidación** y encima aplicamos nuestro paquete,
igual que se va a hacer el día de la integración:

1. `db-init.sql.gz` (init del contenedor `postgres`)
2. sus migraciones, con su runner (`docker compose --profile tools run --rm liquidacion-migraciones`)
3. nuestro paquete (`database/aplicar-paquete-personal.sh`)
4. la demo (`seed_demo.sql`, solo local)

`make liquidacion` hace 1 y 2; `make reset` hace todo.

## Ver el contenido

```bash
gunzip -c database/liquidacion/db-init.sql.gz | less
tar -tzf database/liquidacion/migraciones.tar.gz
```

## Cómo actualizarlo

Desde la carpeta `scripts/` del repo de liquidación:

```bash
gzip -9 -n -c db-init.sql > <pfg-backend>/database/liquidacion/db-init.sql.gz
tar --owner=0 --group=0 --numeric-owner -cf - migrations run-migrations-pg.sh | gzip -9 -n > <pfg-backend>/database/liquidacion/migraciones.tar.gz
```

Después actualizar la fecha y la última migración de arriba y correr `make reset`.

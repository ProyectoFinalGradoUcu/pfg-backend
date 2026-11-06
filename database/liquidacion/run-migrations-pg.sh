#!/bin/sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# =============================================
# Modo: crear nueva migracion
# =============================================
if [ "${1}" = "new" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    LOCAL_MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

    echo -e "${BLUE}=============================================${NC}"
    echo -e "${BLUE}  Nueva Migracion - FAU Liquidacion${NC}"
    echo -e "${BLUE}=============================================${NC}"
    echo ""

    printf "Descripcion de la migracion: "
    read description

    if [ -z "$description" ]; then
        echo -e "${RED}[ERROR] La descripcion no puede estar vacia${NC}"
        exit 1
    fi

    clean_desc=$(echo "$description" | tr '[:upper:]' '[:lower:]' | tr ' ' '_' | sed 's/[^a-z0-9_]//g')

    if [ -z "$clean_desc" ]; then
        echo -e "${RED}[ERROR] La descripcion no contiene caracteres validos${NC}"
        exit 1
    fi

    # nombre en schema_migrations es VARCHAR(200); el runner usa la parte descriptiva del filename como nombre
    if [ "${#clean_desc}" -gt 185 ]; then
        echo -e "${RED}[ERROR] La descripcion es demasiado larga (${#clean_desc} chars). Maximo 185 caracteres.${NC}"
        exit 1
    fi

    TIMESTAMP=$(date +%Y%m%d%H%M%S)
    FILENAME="${TIMESTAMP}_${clean_desc}.sql"
    FILEPATH="$LOCAL_MIGRATIONS_DIR/$FILENAME"

    if [ -f "$FILEPATH" ]; then
        echo -e "${RED}[ERROR] Ya existe un archivo con ese timestamp: $FILENAME${NC}"
        exit 1
    fi

    touch "$FILEPATH"
    echo -e "${GREEN}[OK] Creado: $FILEPATH${NC}"
    exit 0
fi

# =============================================
# Modo: ejecutar migraciones
# =============================================

# Variables de entorno
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-fau_liquidacion}"
DB_USER="${DB_USER:-fau_user}"
DB_PASSWORD="${DB_PASSWORD:-fau_password}"

MIGRATIONS_DIR="/migrations"

# Funcion para ejecutar SQL
execute_sql() {
    local sql="$1"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 -P pager=off -c "$sql" 2>&1
}

# Funcion para ejecutar archivo SQL
execute_file() {
    local file="$1"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 -P pager=off -f "$file" 2>&1
}

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}  Sistema de Migraciones FAU Liquidacion${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Verificar conexion
echo -e "${BLUE}Verificando conexion a base de datos...${NC}"
if ! execute_sql "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}[ERROR] No se pudo conectar a la base de datos${NC}"
    echo -e "${YELLOW}  Host: $DB_HOST:$DB_PORT${NC}"
    echo -e "${YELLOW}  Database: $DB_NAME${NC}"
    echo -e "${YELLOW}  User: $DB_USER${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Conexion exitosa${NC}"
echo ""

# Inicializar sistema de control (migracion 000)
echo -e "${BLUE}Inicializando sistema de control de migraciones...${NC}"
control_migration="$MIGRATIONS_DIR/000_crear_control_migraciones.sql"

if [ -f "$control_migration" ]; then
    if execute_file "$control_migration" > /tmp/migration_000.log 2>&1; then
        echo -e "${GREEN}[OK] Sistema de control inicializado${NC}"
    else
        echo -e "${RED}[ERROR] Error al inicializar sistema de control${NC}"
        cat /tmp/migration_000.log
        exit 1
    fi
else
    echo -e "${RED}[ERROR] No se encontro archivo de control: 000_crear_control_migraciones.sql${NC}"
    exit 1
fi
echo ""

# Validar integridad de archivos de migracion
echo -e "${BLUE}Validando archivos de migracion...${NC}"

seen_versions=""
validation_errors=0

for migration_file in $(ls "$MIGRATIONS_DIR"/[0-9]*_*.sql 2>/dev/null | sort || true); do
    [ -f "$migration_file" ] || continue
    filename=$(basename "$migration_file")
    version=$(echo "$filename" | sed -E 's/^([0-9]+)_.*/\1/')

    for v in $seen_versions; do
        if [ "$v" = "$version" ]; then
            echo -e "${RED}[ERROR] Version duplicada: $version ($filename)${NC}"
            validation_errors=$((validation_errors + 1))
        fi
    done
    seen_versions="$seen_versions $version"
done

if [ "$validation_errors" -gt 0 ]; then
    echo -e "${RED}[ERROR] Se encontraron $validation_errors errores de validacion. Abortando.${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Archivos de migracion validos${NC}"
echo ""

# Ejecutar migraciones pendientes
echo -e "${BLUE}Ejecutando migraciones pendientes...${NC}"

migrations_executed=0
migrations_skipped=0
migrations_total=0
has_errors=0

for migration_file in $(ls "$MIGRATIONS_DIR"/[0-9]*_*.sql 2>/dev/null | sort || true); do
    if [ ! -f "$migration_file" ]; then
        continue
    fi

    filename=$(basename "$migration_file")

    # Saltar la migracion 000
    case "$filename" in
        000_*) continue ;;
    esac

    # Extraer version y nombre
    version=$(echo "$filename" | sed -E 's/^([0-9]+)_.*/\1/')
    name=$(echo "$filename" | sed -E 's/^[0-9]+_(.*)\.sql$/\1/' | tr '_' ' ')

    migrations_total=$((migrations_total + 1))

    # Verificar si ya fue ejecutada
    is_executed=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT migracion_ejecutada('$version');" 2>/dev/null | tr -d '[:space:]')

    if [ "$is_executed" = "t" ]; then
        echo -e "${YELLOW}[SKIP] Migracion $version ya ejecutada, saltando...${NC}"
        migrations_skipped=$((migrations_skipped + 1))
        continue
    fi

    # Registrar inicio
    if ! execute_sql "SELECT registrar_migracion('$version', '$name');" > /dev/null 2>&1; then
        echo -e "${RED}[ERROR] Error al registrar migracion $version${NC}"
        has_errors=1
        break
    fi

    # Ejecutar migracion
    start_time=$(date +%s)

    if execute_file "$migration_file" > /tmp/migration_${version}.log 2>&1; then
        end_time=$(date +%s)
        duration=$(((end_time - start_time) * 1000))

        execute_sql "SELECT marcar_migracion_exitosa('$version', $duration);" > /dev/null 2>&1

        echo -e "${GREEN}[OK] Migracion $version ejecutada exitosamente (${duration}ms)${NC}"
        migrations_executed=$((migrations_executed + 1))
    else
        error_msg=$(cat /tmp/migration_${version}.log | tail -20 | sed "s/'/''/g")
        execute_sql "SELECT marcar_migracion_fallida('$version', '$error_msg');" > /dev/null 2>&1 || true

        echo -e "${RED}[ERROR] Migracion $version fallo${NC}"
        echo -e "${RED}Detalle:${NC}"
        cat /tmp/migration_${version}.log
        has_errors=1
        break
    fi
done

echo ""
echo -e "${BLUE}=============================================${NC}"
if [ $has_errors -eq 0 ]; then
    echo -e "${GREEN}[OK] Proceso de migracion completado${NC}"
else
    echo -e "${RED}[ERROR] Proceso de migracion finalizado con errores${NC}"
fi
echo -e "${BLUE}=============================================${NC}"
echo -e "  Total de migraciones: $migrations_total"
echo -e "  Ejecutadas: $migrations_executed"
echo -e "  Saltadas: $migrations_skipped"
echo ""

# Mostrar estado actual
if [ $has_errors -eq 0 ]; then
    echo -e "${BLUE}Estado actual de migraciones:${NC}"
    execute_sql "SELECT version, nombre, ejecutado_en::DATE as fecha, tiempo_ejecucion_ms::TEXT || 'ms' as tiempo FROM schema_migrations WHERE estado = 'SUCCESS' ORDER BY version;" 2>/dev/null || true
    echo ""
    echo -e "${GREEN}Todas las migraciones completadas exitosamente.${NC}"
fi

exit $has_errors
# Análisis de campos pendientes — Módulo de Reportes

Revisión del `schema.prisma` / `schema.sql` actuales contra el listado de campos
pendientes de `README.md` (campos pedidos por la Fuerza Aérea que hoy no existen
en el modelo de datos). Para cada campo se indica en qué tabla iría, si conviene
una columna nueva o una tabla nueva, y el motivo.

---

## Ficha de Datos Personales — `ficha-personal`

| Campo | Tabla destino | Propuesta | Motivo |
|---|---|---|---|
| Credencial Cívica | `personas` | Columna nueva `credencial_civica VARCHAR(20)` | Dato 1:1 de la persona, mismo nivel que `cedula`. |
| Fecha de boda | `personas` o `relaciones_familiares` | `personas.fecha_matrimonio DATE`, **o** agregar `fecha_inicio DATE` a `relaciones_familiares` (para la fila con `tipo_relacion = 'conyuge'`) | `relaciones_familiares` ya modela el vínculo; agregarle fecha evita duplicar el dato si mañana se necesita para más de un tipo de relación (ej. adopción). Si se prefiere simplicidad, una columna directa en `personas` alcanza. |
| Cónyuge (nombre) | — requiere decisión de diseño | Ver nota abajo | `form3100.conyuge_nombre/apellido/cedula/...` ya existen, pero **solo aplican al formulario tributario**. `relaciones_familiares.familiar_id` es FK obligatoria a `personas`, así que solo sirve si el cónyuge **también es funcionario** (tiene fila en `personas`). Si el cónyuge no es funcionario, hoy no hay dónde guardarlo fuera de `form3100`. |
| Nombres de los hijos | `dependientes` (ya existe) | Sin cambio de esquema | `dependientes.tipo/nombre/cedula/fecha_nacimiento` ya cubre el dato. El reporte `ficha-personal.reporte.ts` simplemente no lo está consultando todavía — es un gap de la definición del reporte, no de la base. |
| Sección Judicial | `personas.seccional` (a confirmar) | Sin cambio si se confirma | Columna `seccional VARCHAR(100)` ya existe; falta confirmar con el equipo si es el mismo concepto. |

**Nota de diseño — cónyuge no-funcionario:** si se quiere reutilizar `relaciones_familiares`
para cualquier reporte (no solo `form3100`), hay que decidir entre (a) exigir que todo
familiar tenga una fila mínima en `personas` (sin usuario/relación laboral), o (b) crear una
tabla `personas_familiares_externos` con nombre/cédula/fecha_nacimiento igual que
`form3100_personas_cargo`, para familiares que no son funcionarios.

---

## Destinos — `destinos` *(retirado de la UI, se documenta igual)*

| Campo | Tabla destino | Propuesta | Motivo |
|---|---|---|---|
| Número de destino (Des Num) | `destinos` | Columna nueva `numero_destino VARCHAR(20)` | `destinos` solo tiene `ubicacion`, `numero_orden`, `tipo_destino`; falta el identificador de negocio del destino en sí. |
| Fecha de la Orden | `asignaciones_funcionario` | Columna nueva `fecha_orden DATE` | El número de orden vive en `destinos.numero_orden`, pero la fecha de esa orden es un dato del **movimiento/asignación de la persona**, no del destino (un mismo destino se usa en muchas órdenes distintas). |
| N.º y Fecha de Boletín | `asignaciones_funcionario` | Columnas nuevas `numero_boletin VARCHAR(50)`, `fecha_boletin DATE` | Mismo patrón que `funcionarios_misiones.boletin` / `funcionarios_cursos.boletin`, pero ahí solo hay número, no fecha — replicar con fecha incluida. |
| N.º y Fecha de Resolución | `asignaciones_funcionario` | Columnas nuevas `numero_resolucion VARCHAR(50)`, `fecha_resolucion DATE` | Igual razonamiento: la resolución formaliza la asignación puntual, no el destino físico. |

---

## Listado de Movimientos por Unidad — `movimientos-unidad`

| Campo | Tabla destino | Propuesta | Motivo |
|---|---|---|---|
| Nivel (5 / 7 / 9) | `tipos_movimiento` | Columna nueva `nivel SMALLINT` | Por los valores de ejemplo (5/7/9) parece ser una clasificación fija del **tipo** de movimiento, no algo que varíe fila a fila en `movimientos_laborales`. A confirmar con el equipo si en cambio es propio de cada movimiento individual (en cuyo caso iría en `movimientos_laborales`). |
| Marca (530) | `tipos_movimiento` | Columna nueva `marca VARCHAR(10)` | Mismo razonamiento que "Nivel": todo indica que es un atributo del catálogo `tipos_movimiento`, no del hecho puntual. |
| Código corto del tipo de movimiento ("A") | `tipos_movimiento` | Columna nueva `codigo_corto VARCHAR(5)` | Hoy `tipos_movimiento` solo tiene `nombre` (texto largo) y `es_alta` (boolean); falta el código corto usado en los formularios impresos. |

---

## Misiones / Oficiales — `misiones-oficiales`

| Campo | Tabla destino | Propuesta | Motivo |
|---|---|---|---|
| Fecha de la Orden | `misiones` | Columna nueva `fecha_orden DATE` | `misiones` ya tiene `numero_orden`, pero no la fecha asociada. |
| N.º y Fecha de Resolución | `misiones` | Columnas nuevas `numero_resolucion VARCHAR(50)`, `fecha_resolucion DATE` | No existe hoy ningún campo de resolución en `misiones`. |
| Resolución CJE | `misiones` | Columna nueva `resolucion_cje VARCHAR(50)` (a confirmar si es número, booleano o fecha) | Concepto distinto a la resolución genérica de arriba; falta aclarar con el equipo qué representa "CJE" antes de tipar la columna. |

---

## Legajo / Ficha del Oficial — `legajo-oficial` *(retirado de la UI, se documenta igual)*

| Campo | Tabla destino | Propuesta | Motivo |
|---|---|---|---|
| Credencial Cívica | `personas` | Mismo campo que en `ficha-personal` | Ver arriba — un solo campo sirve para ambos reportes. |
| Cargo interno | `asignaciones_funcionario` o `relaciones_laborales` | Columna nueva `cargo_interno VARCHAR(200)` | El README aclara que `asignaciones_funcionario.posicion_destino` es "el cargo del destino"; el "cargo interno" parece ser un dato distinto (jerarquía/función dentro de la unidad), sin columna hoy. |
| Derecha de tanda | `relaciones_laborales` | Columna nueva `derecha_tanda` (tipo a definir) | No hay campo ni cálculo derivado hoy. `relaciones_laborales` ya tiene `fecha_ultimo_ascenso`, `grados.orden` — es candidato natural si termina siendo un valor calculado, pero como campo se necesita aclarar la regla con el equipo. |
| Códigos (-1-4-7-8-) | `relaciones_laborales` (a confirmar) | Columna nueva, ej. `codigos_legajo VARCHAR(20)` | Sin definición clara todavía; no crear la columna hasta saber si es una lista de códigos de catálogo (mejor tabla de relación) o un campo de texto libre. |
| MIN / FEDES / F-Reg-M/O | — | Pendiente de aclaración | No se puede proponer tabla/columna sin saber qué representan estas siglas. |

---

## Resumen Fuerza Efectiva — `resumen-fuerza-efectiva`

| Campo | Tabla destino | Propuesta | Motivo |
|---|---|---|---|
| Total Plazas / Vacantes | Tabla nueva, ej. `cupos_presupuestales` | `id, grado_id, unidad_id?, cantidad_plazas, vigente_desde, vigente_hasta` | Esto no es una columna suelta: hoy solo existe `movimientos_laborales.plaza` (texto libre) y no hay ningún catálogo de cupos presupuestales con los que comparar "ocupadas" contra "vacantes". Se necesita una tabla de referencia, en el mismo espíritu que `remuneraciones_grado` o `tabla_permanencia` (vigencias por grado). |
| Fuera de Cuadro | `situaciones` (catálogo) + `relaciones_laborales.situacion_id` | Agregar fila al catálogo `situaciones`, o si es ortogonal a "situación", columna nueva `relaciones_laborales.fuera_de_cuadro BOOLEAN` | Depende de si "fuera de cuadro" es mutuamente excluyente con las situaciones existentes (activo, licencia, etc.) o puede combinarse con cualquiera de ellas — en ese segundo caso, mejor un booleano aparte que forzar el catálogo. |
| Reservistas | `personas` o `situaciones` | Columna nueva `personas.condicion_revista VARCHAR(20)` (activo/reserva/etc.), o fila nueva en `situaciones` | Mismo dilema que "Fuera de Cuadro": si es un estado que convive con la relación laboral activa, mejor catálogo/columna dedicada en vez de mezclarlo con `situaciones`. |

---

## Altas, Ascensos, Bajas y Retiros — `movimientos-personal`

| Campo | Tabla destino | Propuesta | Motivo |
|---|---|---|---|
| N.º de Orden del ascenso (O.C.G.F.A. N.º …) | `ascensos` | Columna nueva `numero_orden VARCHAR(50)` | Mismo patrón ya usado en `funcionarios_cursos.numero_orden` y `misiones.numero_orden`; hoy este dato vive suelto dentro de `ascensos.observaciones` (texto libre). |
| Subsidio Transitorio | `retiros` | Columnas nuevas `subsidio_transitorio BOOLEAN DEFAULT false`, `monto_subsidio_transitorio DECIMAL(14,2)`, `subsidio_transitorio_hasta DATE` | `retiros` hoy solo tiene `fecha_retiro`, `hora_retiro`, `motivo`. El subsidio transitorio es un concepto asociado al evento de baja/retiro, así que encaja ahí en vez de crear una tabla nueva — a menos que el equipo confirme que puede haber más de un subsidio por persona a lo largo del tiempo, en cuyo caso conviene una tabla `subsidios_transitorios` aparte (relación 1\:N con `personas`). |

> Nota de datos (ya señalada en el README): para que las secciones de este reporte muestren
> filas hace falta que `tipos_movimiento`, `motivos_baja`, `ascensos` y `retiros` tengan
> registros cargados — esto es carga de datos, no un gap de esquema.

---

## Resumen de tablas afectadas

| Tabla | Tipo de cambio |
|---|---|
| `personas` | + columnas (`credencial_civica`, posible `fecha_matrimonio`, posible `condicion_revista`) |
| `destinos` | + columna (`numero_destino`) |
| `asignaciones_funcionario` | + columnas (`fecha_orden`, `numero_boletin`, `fecha_boletin`, `numero_resolucion`, `fecha_resolucion`, posible `cargo_interno`) |
| `tipos_movimiento` | + columnas (`nivel`, `marca`, `codigo_corto`) |
| `misiones` | + columnas (`fecha_orden`, `numero_resolucion`, `fecha_resolucion`, `resolucion_cje`) |
| `relaciones_laborales` | + columnas (posible `cargo_interno`, `derecha_tanda`, `codigos_legajo`, `fuera_de_cuadro`) |
| `ascensos` | + columna (`numero_orden`) |
| `retiros` | + columnas (`subsidio_transitorio`, `monto_subsidio_transitorio`, `subsidio_transitorio_hasta`) |
| `cupos_presupuestales` | **tabla nueva** (plazas/vacantes por grado) |
| `relaciones_familiares` | posible columna (`fecha_inicio`) o rediseño para familiares no-funcionarios |
| `dependientes` | sin cambios — falta conectar el reporte, no el dato |
| `personas.seccional` | sin cambios — falta confirmar equivalencia con "Sección Judicial" |

## Pendiente de aclarar con el equipo antes de migrar

- Significado de **MIN**, **FEDES**, **F-Reg-M/O** (legajo del oficial).
- Si **Nivel** (5/7/9) y **Marca** (530) son propiedades del catálogo `tipos_movimiento` o de cada movimiento puntual.
- Qué codifican los **Códigos** (-1-4-7-8-) y la **Derecha de tanda**.
- Si **Sección Judicial** = `personas.seccional`.
- Si **Cónyuge** debe poder registrarse aunque no sea funcionario (afecta el diseño de `relaciones_familiares`).
- Si **Fuera de Cuadro** y **Reservistas** son compatibles con el catálogo `situaciones` o necesitan modelarse aparte.
- Si puede haber más de un **Subsidio Transitorio** por persona en el tiempo (definiría tabla nueva vs. columnas en `retiros`).

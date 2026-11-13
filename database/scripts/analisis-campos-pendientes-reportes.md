# Analisis de campos pendientes - Modulo de Reportes

Revision del modelo y de las definiciones de reportes luego de la respuesta recibida
de la Fuerza Aerea el 15/10/2026. Se distingue entre:

- **Ya disponible:** el modelo tiene el dato; falta, como maximo, conectarlo al reporte.
- **Confirmado para agregar:** la respuesta define suficientemente el concepto y su ubicacion.
- **Pendiente de aclaracion:** todavia no se puede disenar sin inventar reglas o significados.

La respuesta confirma ademas que los actos administrativos (Orden de Comando General,
boletin y resolucion) llegan ya emitidos con numero y fecha. El sistema no debe generarlos:
debe guardarlos en forma estructurada y, cuando corresponda, asociarlos a la actuacion
concreta de la persona.

---

## Decisiones definitivas (20/10/2026)

Resolucion del equipo sobre la lista numerada de campos; aca queda lo que efectivamente
se implementa y lo que queda descartado.

### Aprobados

1. `personas.credencial_civica` — sirve para ficha personal y legajo.
2. Seccion Judicial = `personas.seccional` — confirmado; sin cambio de esquema.
3. Destinos: todo va — `numero_destino`, `fecha_orden`, `fecha_boletin`,
   `numero_resolucion`, `fecha_resolucion`.
4. Nivel de idoneidad 3/5/7/9: NO como tabla historica, sino un **campo sobre la
   persona** con el nivel (por ejemplo `personas.nivel_idoneidad SMALLINT`, valores
   3/5/7/9, NULL si no tiene). Sin historial ni vinculo a cursos/ordenes.
5. `tipos_movimiento.marca` — va.
6. Codigo corto de tipos de movimiento: **no se agrega** (la "A" es "Alta", que ya
   existe como `tipos_movimiento.es_alta`).
7. Misiones: van los campos sobre `misiones` — `fecha_orden`, `fecha_boletin`,
   `numero_resolucion`, `fecha_resolucion`, `resolucion_cje`. El reporte sigue
   consultando `funcionarios_misiones`; NO se migra a `convocatorias`.
8. Legajo oficial: solo van `codigos_legajo` (columna en `relaciones_laborales`
   o donde corresponda) y la Credencial Civica (comparte n.º 1).

### Descartados (no se agregan)

- Familiares externos / conyuge no funcionario y fecha de matrimonio: queda
  como estaba, pendiente para otro momento.
- Tabla de cargos/comisiones (asignaciones funcionales): descartada.
- `legajo_militar.derecha_graduacion` y `promocion_egreso`: descartados.
- MIN / FEDES / F-Reg-M/O: se dejan sin implementar.
- Resumen Fuerza Efectiva: sin cambios de esquema (no `cupos_presupuestales`
  ni `fuera_cuadro`).
- Subsidio transitorio: sin cambios de esquema ni seccion nueva en reportes.
- `niveles_idoneidad_persona` como tabla historica: reemplazada por el campo
  simple del punto 4.

### Acciones pendientes de codigo (sin esquema)

- Conectar hijos (`dependientes`) a `ficha-personal.reporte.ts`.
- `Marca 530` ya aprobada en el punto 5; las preguntas de aclaracion que siguen
  aplican solo a los items no resueltos arriba.

Las secciones posteriores conservan el analisis original al 15/10 para trazabilidad;
ante discrepancia, manda lo resuelto en esta seccion.

---

## Ficha de Datos Personales - `ficha-personal`

Estos puntos no fueron contestados en la nueva respuesta y mantienen su estado anterior.

| Campo | Estado | Propuesta / accion |
|---|---|---|
| Credencial Civica | Confirmado para agregar | `personas.credencial_civica VARCHAR(20)`. Es un dato 1:1 de la persona. |
| Fecha de boda | Pendiente de diseno | Preferir `relaciones_familiares.fecha_inicio DATE` para fechar el vinculo conyugal. Una columna `personas.fecha_matrimonio` seria mas simple, pero no preserva historial. |
| Conyuge (nombre) | Pendiente de diseno | `form3100` no es fuente general del legajo. `relaciones_familiares` solo admite familiares que tambien existen en `personas`; hay que decidir como registrar familiares externos. |
| Nombres de los hijos | Ya disponible | `dependientes` ya tiene `tipo`, `nombre`, `cedula` y `fecha_nacimiento`. Falta consultarlos desde `ficha-personal.reporte.ts`. |
| Seccion Judicial | Pendiente de aclaracion | Confirmar si equivale a `personas.seccional`; si es asi no requiere migracion. |

Para conyuge no funcionario se recomienda una entidad general de familiares externos,
en lugar de reutilizar los campos tributarios de `form3100`. Debe soportar al menos nombre,
cedula opcional, fecha de nacimiento opcional, tipo de relacion y vigencia del vinculo.

---

## Destinos - `destinos` *(retirado de la UI, se documenta igual)*

La respuesta aclara que el **destino es la unidad** y que no se pueden tener dos destinos
simultaneos. Esto coincide con el modelo actual: `destinos` es el historial de asignaciones
persona-unidad y existe un indice unico para un solo destino activo por persona.

| Campo | Estado | Propuesta / accion |
|---|---|---|
| Numero de destino (Des Num) | Pendiente de aclaracion | No fue respondido. No agregar `destinos.numero_destino` todavia. Preguntar si es el codigo de la unidad; si lo es, ya existe `unidades.codigo`. |
| Numero de la Orden | Ya disponible | `destinos.numero_orden`. |
| Fecha de la Orden | Confirmado para agregar | `destinos.fecha_orden DATE`. La FAU confirmo que toda orden viene con numero y fecha y se guarda en la ficha. |
| Numero de Boletin | Ya disponible | `destinos.boletin`. |
| Fecha de Boletin | Confirmado para agregar | `destinos.fecha_boletin DATE`. |
| Numero de Resolucion | Confirmado para agregar | `destinos.numero_resolucion VARCHAR(50)`. |
| Fecha de Resolucion | Confirmado para agregar | `destinos.fecha_resolucion DATE`. |

Numero y fecha deben vivir en la asignacion `destinos`, no en `unidades`, porque formalizan
el destino de una persona. Conviene permitir orden, boletin y resolucion opcionales por
separado: la respuesta indica que son documentos recibidos, pero no confirma que los tres
existan obligatoriamente en toda asignacion.

La explicacion sobre comisiones introduce un requisito distinto del reporte original:
una persona puede tener un unico destino y varias funciones/comisiones, incluso en otra
unidad y bajo otro jefe. Si el sistema debe registrar esto, no debe abrir un segundo
`destinos`; hace falta modelarlo por separado (ver Legajo).

---

## Listado de Movimientos por Unidad - `movimientos-unidad`

| Campo | Estado | Propuesta / accion |
|---|---|---|
| Nivel (3 / 5 / 7 / 9) | Confirmado, pero falta definir historial | Es nivel de pericia o idoneidad del personal subalterno, otorgado por la Escuela Tecnica de Aeronautica por cursos, certificados o titulos. **No es un atributo de `tipos_movimiento` ni del movimiento laboral.** |
| Marca (ej. 530) | Pendiente de aclaracion | No fue respondido. No crear columna hasta saber que entidad identifica y si cambia con el tiempo. |
| Codigo corto del tipo de movimiento (ej. `A`) | Pendiente de aclaracion | No fue respondido. Si la FAU confirma un catalogo estable, agregar `tipos_movimiento.codigo_corto VARCHAR(10) UNIQUE`. |

Para Nivel no alcanza con una columna fija en `relaciones_laborales` si se debe informar
como estaba una persona en una fecha historica. La opcion recomendada es una tabla, por
ejemplo `niveles_idoneidad_persona`:

| Columna | Tipo / finalidad |
|---|---|
| `id` | PK |
| `persona_id` | FK a `personas` |
| `nivel` | `SMALLINT`, restringido a 3, 5, 7 o 9 |
| `fecha_otorgamiento` | fecha desde la que rige |
| `numero_orden`, `fecha_orden` | acto administrativo, si existe |
| `curso_id` | FK opcional a `cursos` |
| `documento_respaldo` / `observaciones` | certificado, titulo o antecedente |
| `vigente_hasta` | opcional, para preservar historial |

Antes de implementarla hay que confirmar si el nivel se aplica a la persona en general o
a una especialidad/escalafon concreto, y si puede bajar o caducar. Los cursos de nivel 7 y
9 que hoy aparecen en `seed_ascensos.sql` sirven como requisitos de ascenso, pero cursarlos
no sustituye el registro formal del nivel otorgado.

---

## Misiones / Oficiales - `misiones-oficiales`

La respuesta describe esta secuencia: una resolucion o, a veces, un boletin origina la
mision; luego Secretaria del Comandante en Jefe genera la orden. Por lo tanto, esos datos
pertenecen a la **convocatoria/instancia de la mision**, no al catalogo `misiones` ni, salvo
excepcion individual, a `funcionarios_misiones`.

| Campo | Estado | Propuesta / accion |
|---|---|---|
| Numero de Orden | Ya disponible parcialmente | Existe en `convocatorias.numero_orden` y en el modelo legado `misiones.numero_orden`. El reporte actual todavia consulta `funcionarios_misiones`, no `convocatorias`. |
| Fecha de la Orden | Confirmado para agregar | `convocatorias.fecha_orden DATE`. |
| Numero de Boletin | Ya disponible | `convocatorias.boletin`. |
| Fecha de Boletin | Confirmado para agregar | `convocatorias.fecha_boletin DATE`. |
| Numero de Resolucion | Confirmado para agregar | `convocatorias.numero_resolucion VARCHAR(50)`. |
| Fecha de Resolucion | Confirmado para agregar | `convocatorias.fecha_resolucion DATE`. |
| Resolucion CJE | Pendiente de aclaracion | Probablemente sea una resolucion interna del Comandante en Jefe, pero la propia respuesta pide confirmarlo con Veins. Preguntar si es un documento adicional y que numero/fecha registra. |

El reporte debe migrar a `convocatorias` + `funcionarios_convocatorias`; de lo contrario,
aunque se agreguen los campos nuevos, no los va a leer. Antes de eliminar o ignorar el
modelo legado hay que verificar si existen datos productivos aun guardados directamente
en `misiones` / `funcionarios_misiones`.

---

## Legajo / Ficha del Oficial - `legajo-oficial` *(retirado de la UI, se documenta igual)*

| Campo | Estado | Propuesta / accion |
|---|---|---|
| Credencial Civica | Confirmado para agregar | Mismo `personas.credencial_civica` usado por ficha personal. |
| Cargo interno | Concepto confirmado; modelo insuficiente | Es el cargo ocupado dentro de la unidad de destino. Una persona puede tener uno o varios cargos. `destinos.posicion_destino` solo admite un texto y no preserva multiples cargos con vigencia. |
| Comisiones | Nuevo requisito detectado | Son funciones en otra unidad, sin perjuicio del destino principal y bajo otro jefe. No deben modelarse como un segundo destino. |
| Derecha de tanda / graduacion | Concepto confirmado | Es la posicion en que la persona se graduo al terminar la carrera de cuatro anos; viene determinada por la Escuela Militar de Aeronautica. |
| Codigos (-1-4-7-8-) | Pendiente de aclaracion | No fueron respondidos. No crear un `VARCHAR` opaco sin conocer si son multiples categorias de un catalogo. |
| MIN | Pendiente de confirmacion | Puede significar Ministerio, pero la respuesta no lo asegura. |
| FEDES | Hipotesis, no confirmado | Podria ser Fecha de Destino. Si se confirma, ya se obtiene de `destinos.fecha_inicio`; no agregar columna duplicada. |
| F-Reg-M/O | Hipotesis, no confirmado | Podria ser Fecha de Regreso de Mision Oficial. Si se confirma, ya existe `convocatorias.fecha_llegada` (y `misiones.fecha_llegada` en el modelo legado). |

Para la derecha de tanda, agregarla a `legajo_militar`, no a `relaciones_laborales`, porque
es un antecedente estable de egreso y no una propiedad de un contrato. Falta confirmar si
el dato mostrado es solo una posicion ordinal (`SMALLINT`) o si tambien se requiere tanda,
promocion/anio e instituto. Una propuesta completa seria:

- `legajo_militar.derecha_graduacion SMALLINT`
- `legajo_militar.promocion_egreso VARCHAR(50)` o ano de promocion, si corresponde

Para cargos y comisiones, si se reincorpora este reporte a la UI, se recomienda una tabla
de asignaciones funcionales en lugar de agregar `cargo_interno` a la relacion laboral:

| Columna | Finalidad |
|---|---|
| `persona_id` | funcionario |
| `destino_id` | destino principal durante el que se asigno la funcion |
| `unidad_id` | unidad donde se ejerce; puede diferir en una comision |
| `cargo` | denominacion del cargo o funcion |
| `tipo` | `CARGO` o `COMISION` |
| `fecha_inicio`, `fecha_fin` | vigencia e historial |
| `jefe_persona_id` | opcional, si realmente se necesita reportar la dependencia |
| orden/boletin/resolucion | opcionales, si la asignacion funcional se formaliza por acto propio |

---

## Resumen Fuerza Efectiva - `resumen-fuerza-efectiva`

| Campo | Estado | Propuesta / accion |
|---|---|---|
| Plazas presupuestadas por grado | Confirmado para agregar | Existe un cuadro para personal superior y subalterno. Requiere tabla con vigencia; no se puede deducir de `movimientos_laborales.plaza`. |
| Vacantes | Calculado | `plazas presupuestadas - plazas ocupadas`, aplicando correctamente fuera de cuadro. |
| Fuera de Cuadro | Confirmado para agregar | Es una condicion presupuestal temporal de un ascenso sin vacante. Convive con la actividad y deja de regir cuando la persona pasa a ocupar una vacante. No debe agregarse a `situaciones`. |
| Reservistas | Ya disponible | Ya existen las situaciones `SIT05` (personal superior reservista) y `SIT08` (reservistas tropa). El reporte debe contarlas como fuerza efectiva separada, no mezclarlas con activos. |

Tabla sugerida para el cuadro presupuestal:

`cupos_presupuestales(id, grado_id, tipo_funcionario, unidad_id?, cantidad_plazas,
vigente_desde, vigente_hasta)`.

Todavia hay que confirmar si el cuadro es global por grado o se desglosa por unidad,
escalafon y/o programa presupuestal. No se debe fijar `unidad_id` como obligatorio sin esa
respuesta.

Para Fuera de Cuadro se recomienda historial, no un booleano permanente:

`fuera_cuadro(id, persona_id, ascenso_id, grado_id, fecha_inicio, fecha_fin,
acto_autorizacion, observaciones)`.

El calculo presupuestal debe acordarse con la FAU. La respuesta dice que al ascender fuera
de cuadro la vacante que la persona libera "ya no se ocupa". Esto implica una regla de
conteo especial; no basta con excluir al ascendido de las plazas de su nuevo grado. Se
necesita confirmar explicitamente como se reflejan durante ese periodo la plaza del grado
anterior, la del nuevo grado y la vacante publicada.

El reporte actual solo busca relaciones con `estado = 'activo'` y agrupa por grado. Para
terminarlo debe ademas:

- incluir filas de todos los grados presupuestados, aun cuando tengan cero efectivos;
- separar activos y reservistas mediante `situaciones.codigo`;
- contar fuera de cuadro desde su historial vigente;
- mostrar plazas totales y vacantes segun la regla presupuestal confirmada;
- definir si los reincorporados se incluyen en ocupadas y, a la vez, se muestran como
  subconjunto informativo.

---

## Altas, Ascensos, Bajas y Retiros - `movimientos-personal`

| Campo | Estado | Propuesta / accion |
|---|---|---|
| Numero de Orden del ascenso | Ya disponible | `ascensos.numero_orden` y, de forma normalizada, `ascensos_ordenes.numero_orden`. |
| Fecha de Orden del ascenso | Ya disponible | `ascensos_ordenes.fecha_orden`. |
| Formato O.C.G.F.A. | Confirmado semanticamente | Es una Orden del Comando General con numero y formato institucional. Guardar una unica representacion en `numero_orden`; no crear otro campo por la etiqueta del formulario. |
| Subsidio Transitorio | Ya disponible como situacion | Existe `situaciones.SIT22` con calculador `SubsidioCalculator`. La respuesta confirma que dura hasta tres anos, supone baja presupuestal pero mantiene dependencia de la unidad y normalmente es un evento unico. |

El analisis anterior proponia columnas de subsidio en `retiros`; esa ubicacion no es
correcta. El subsidio comienza antes de decidir continuidad, retiro o baja y, por lo tanto,
no es un atributo de un retiro. Debe representarse mediante una relacion laboral/historial
con situacion `SIT22`, conservando unidad, fecha de inicio y fecha de fin. Si se requiere
guardar junta medica, resolucion o vencimiento previsto, agregar una entidad de expediente
o campos especificos asociados al periodo de subsidio, no a `retiros`.

El reporte actual ya lee `ascensos.numero_orden`, pero no incluye `ascensos_ordenes` y por
eso no puede mostrar `fecha_orden` ni aprovechar plenamente la orden normalizada. Tampoco
tiene una seccion de subsidios. Para completarlo:

- incluir `ascensos_ordenes` al consultar ascensos y preferir su numero/fecha;
- agregar una seccion `Subsidio transitorio` consultando los periodos con `SIT22`;
- acordar si la fecha a mostrar es inicio del subsidio, resolucion de junta o ambas;
- evitar contar el inicio del subsidio como retiro, porque la decision final ocurre despues.

---

## Resumen de cambios recomendados

### Cambios de esquema confirmados

| Entidad | Cambio |
|---|---|
| `personas` | `credencial_civica` |
| `destinos` | `fecha_orden`, `fecha_boletin`, `numero_resolucion`, `fecha_resolucion` |
| `convocatorias` | `fecha_orden`, `fecha_boletin`, `numero_resolucion`, `fecha_resolucion`; posible resolucion CJE luego de confirmarla |
| `legajo_militar` | derecha de graduacion; completar promocion/instituto solo si la FAU lo requiere |
| `niveles_idoneidad_persona` | tabla nueva con historial de niveles 3/5/7/9 y respaldo |
| `cupos_presupuestales` | tabla nueva con plazas por grado, categoria y vigencia |
| `fuera_cuadro` | tabla nueva con vigencia y vinculo al ascenso |
| asignaciones funcionales | tabla nueva para multiples cargos y comisiones, solo si el legajo vuelve al alcance |

### Sin cambio de esquema o ya resuelto

| Dato | Fuente / accion |
|---|---|
| Hijos | `dependientes`; conectar el reporte |
| Reservistas | `situaciones` `SIT05` y `SIT08`; corregir el resumen |
| Subsidio transitorio | `situaciones` `SIT22`; agregar seccion al reporte e historial adecuado |
| Orden de ascenso | `ascensos_ordenes` + `ascensos`; consultar la relacion normalizada |
| Fecha de destino (posible FEDES) | `destinos.fecha_inicio` |
| Fecha de regreso de mision (posible F-Reg-M/O) | `convocatorias.fecha_llegada` |
| Un solo destino activo | Ya garantizado por `uix_destinos_persona_activa` |

---

## Preguntas que aun faltan responder antes de migrar

1. ¿`Des Num` es el codigo del destino/unidad? Si lo es, ¿corresponde a `unidades.codigo` y que formato usa?
2. ¿Que representa `Marca` (por ejemplo 530), a que entidad pertenece y puede cambiar en el tiempo?
3. ¿Cual es el catalogo oficial de codigos cortos de movimientos (por ejemplo `A`)? ¿El codigo es unico por `tipos_movimiento`?
4. ¿El nivel 3/5/7/9 se asigna a la persona o a una especialidad/escalafon? ¿Puede bajar, caducar o coexistir mas de uno? ¿Que numero/fecha de acto y respaldo deben guardarse?
5. ¿Resolucion CJE es una resolucion interna adicional? ¿Tiene numero y fecha, y pertenece a la convocatoria o a cada funcionario?
6. ¿Derecha de graduacion es solo un puesto ordinal? ¿Tambien hay que guardar promocion/tanda, ano e instituto?
7. ¿Que representan exactamente los codigos `-1-4-7-8-`?
8. Confirmar con Veins el significado de `MIN`, `FEDES` y `F-Reg-M/O`. Si las dos ultimas son fechas ya modeladas, no duplicarlas.
9. ¿El cuadro de plazas se define solo por grado y categoria o tambien por unidad, escalafon o programa?
10. ¿Como se cuentan exactamente las plazas anterior y nueva mientras una persona esta fuera de cuadro?
11. Para subsidio transitorio, ¿que campos del acto/junta medica deben reportarse y la fecha fin se fija inicialmente a tres anos o se registra solo al resolverse?
12. ¿Seccion Judicial equivale a `personas.seccional`?
13. ¿Como se registran conyuges no funcionarios y la fecha de matrimonio?

---

## Orden sugerido de implementacion

1. Corregir reportes usando datos que ya existen: hijos, reservistas, ordenes de ascenso y subsidio transitorio.
2. Agregar fechas y resoluciones confirmadas a destinos y convocatorias, junto con DTOs, UI y carga de datos.
3. Resolver con FAU las preguntas de nivel de idoneidad y fuerza efectiva; luego crear sus tablas historicas.
4. Implementar Credencial Civica y derecha de graduacion.
5. Decisión actualizada por Lucas durante la corrección de SCRUM-171: volver a habilitar `Destinos` y `Legajo del Oficial` en el catálogo, con alcance por base y la estructura actual de destinos.
6. No implementar aun `Marca`, `Des Num`, codigos de legajo, `MIN` ni Resolucion CJE basandose en hipotesis.

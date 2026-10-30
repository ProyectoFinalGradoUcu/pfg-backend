# Importador de las bases de la FAU

Carga en el sistema los datos de:

- **`SUBALTERNO en uso.mdb`**: personal subalterno, con todo su historial de altas y bajas.
- **`BASE DE DATOS PERSONAL SUPERIOR ACTUALIZADA.accdb`**: oficiales en actividad.
- **`HORAS DE VUELO 2020-2026.xlsx`**: horas de vuelo, una hoja por trimestre.

Sirve tanto para estos archivos como para exportaciones futuras con el mismo formato. Se puede correr más de una vez: lo que ya está cargado se saltea.

## Qué carga

| Dato | Tabla | Cuándo |
|---|---|---|
| Personas (cédula, nombre, nacimiento, contacto) | `personas` | Si la cédula no existe. Si ya existe, **solo se completan los campos vacíos**; nunca se pisa un dato. |
| Períodos de baja (historial) | `relaciones_laborales`, inactivas | Siempre. Liquidación no liquida relaciones inactivas. |
| Períodos en actividad | `relaciones_laborales`, activas | **Solo con `--crear-activos`**, y solo si la persona no tiene ya uno activo. |
| Destino de cada período | `destinos` | Junto con su período. |
| Horas de vuelo (Excel 2020-2026; `Horasvlo`, la última planilla de cada oficial, sobre todo 2002-2005; y la planilla de `xescala` cuando es anterior a 2020) | `periodos_vuelo`, `registros_vuelo`, `unidades_vuelo` | Siempre. Son tablas solo del módulo de personal. |
| Fecha en que llegó al grado (`FEC_GRA`, subalternos) | `relaciones_laborales.fecha_ultimo_ascenso` | En los períodos que crea. **Liquidación calcula la permanencia desde esta fecha.** En un período activo que ya existía no se completa: solo se avisa. |
| Texto libre sin campo propio: motivo de baja, comisiones, destinos anteriores (en subalternos, también `AÑOS ANTERIORES`, `LICENCIA SIN GOCE DE SUELDO`, `PERIODO DESDE HASTA` y `COMISIONES DEL SERVICIO`) | Observaciones del período | En los períodos que crea. El motivo de baja también va al catálogo (fila de abajo). |
| Motivo de baja (`MOTIVO`) | `relaciones_laborales.motivo_baja_id` y un registro en `retiros` por período de baja | En los períodos de baja. Si el período ya estaba sin motivo, se le completa. Los motivos que faltan en el catálogo se crean vigentes, solo con `--crear-catalogos`. |
| Familia de los oficiales (esposa e hijos con cédula) | `relaciones_familiares` y, para hijos civiles, `personas` con `es_civil` | Si el vínculo no existe. Ver "Familiares". |
| Cargo (oficiales) | `destinos.posicion_destino` | En el destino actual que crea. |
| Sub-unidad (subalternos) y resolución/boletín del destino (oficiales) | Observaciones del destino | En los destinos que crea. |
| Seccional (`Secc_Jud_`, oficiales) | `personas.seccional` | Si está vacía. |
| Lugar de nacimiento de subalternos (`DEPT_NAC`: 1 a 19 = departamentos en orden alfabético) | `personas.lugar_nacimiento` | Si está vacío. |
| Fecha de fallecimiento (baja con motivo de fallecimiento) | `personas.fecha_fallecimiento` | Si está vacía, es el período más reciente y la persona no tiene ninguno activo. |
| Misiones y salidas al exterior (`xsalida`, `Misiones`, `OFICIALES EN MISION`) | `misiones`, `funcionarios_misiones` | Siempre, si la persona existe. |
| Derecha y Numor de oficiales | `relaciones_laborales.derecha/numor` + `historial_derecha_numor` | En los períodos activos que crea; y en los activos que ya existían, **solo si no tienen ni Derecha ni Numor**. Cada valor deja su alta en el historial. |
| Nivel educativo | `legajo_militar` | Si la persona no tiene uno cargado. |
| Historial de ascensos: oficiales (año de cada grado) y subalternos (`FEC_GRA`) | `ascensos` | Si la persona no tiene ya un ascenso vigente a ese grado. |
| Cursos aprobados, subalternos: de pasaje de grado (`CSOCBO2ª-CBO1ª`, `CSOSGTO-SGTO1º`), de Nivel 7/9 (`NIVEL_PER`), especialidades (`ABRE_ESP`, `ESPEC2`) y `CURSOS ETA` | `funcionarios_cursos` (y `cursos`, si falta el curso) | Si la persona no tiene ya ese curso. |
| Años de servicio en otras fuerzas (`FECHA INGRESO ANTERIOR`, `FECHA BAJA`, `FUERZA 1`) | `relaciones_laborales.anios_servicio_anterior` | **Solo en períodos inactivos.** En los activos se informa. El servicio anterior completo queda en observaciones. |
| Unidades, sub-unidades, escalafones y grados que falten | `unidades`, `sub_unidades`, `escalafones`, `grados` | **Solo con `--crear-catalogos`**. |

## Qué no hace nunca

- **No modifica personas que ya existen**: solo completa campos vacíos.
- **No cambia lo que liquidación usa de los períodos activos existentes.** Si una persona ya tiene un período activo (porque liquidación ya le paga), no se le crea otro. Si el grado o la unidad del Access no coinciden con los de la base, se informa y no se corrige. La fecha de último ascenso tampoco se completa: solo se avisa. Lo único que se completa en un activo existente son Derecha y Numor, y solo si los dos están vacíos (son columnas del módulo de personal).
- **No crea un período activo con un grado sin remuneración cargada**, porque haría fallar la liquidación de esa persona.
- **No adivina.** Una fila de vuelo sin cédula que no se puede unir con certeza a una persona por su nombre no se carga: va al informe.
- **No modifica ni borra registros de catálogos existentes.** Solo agrega los que faltan, y únicamente con `--crear-catalogos`.

## Opciones

| Opción | Qué hace |
|---|---|
| *(ninguna)* | **Simulación.** Hace todo dentro de una transacción y la deshace al final. Así se prueban de verdad las restricciones de la base y no queda nada escrito. |
| `--aplicar` | Confirma la transacción: ahora sí escribe. Si algo falla, no escribe nada. |
| `--crear-activos` | Crea los períodos activos de las personas que no tienen uno. **Esas personas pasan a liquidarse en la próxima liquidación**: acordarlo antes con el equipo de liquidación. |
| `--crear-catalogos` | Agrega a la base las unidades, sub-unidades, escalafones, grados y motivos de baja que falten. Son tablas de liquidación: acordarlo antes. Con los archivos actuales, lo nuevo es: el grado `AT_3RA`; los escalafones `ADM` (no vigente), `CADETE` y `SIN_DATO`; las unidades CIRFA (no vigente), D.C.I., D.S.O., ESMADE, la Banda y la Dirección de Personal, con las categorías A, B y C como sub-unidades; y los motivos `BAJA_SOLICITADA`, `CUMPLIDO_SOLICITADA`, `NO_ADAPTACION` y `NO_APTO`. La lista exacta de cada corrida sale en el resumen, en "Catálogos que faltan en la base". |
| `--informe <carpeta>` | Dónde dejar el informe. Por defecto, `informe-importacion-<fecha>` en la carpeta actual. |
| `--database-url <url>` | Base de datos. Por defecto, la variable `DATABASE_URL`. |

## Cómo correrlo

Desde `pfg-backend/backend`, con las dependencias instaladas (`npm install`):

```bash
npx tsx scripts/importacion-fau/main.ts "SUBALTERNO en uso.mdb" "BASE DE DATOS PERSONAL SUPERIOR ACTUALIZADA.accdb" "HORAS DE VUELO 2020-2026.xlsx" --database-url "postgresql://usuario:clave@host:puerto/base"
```

Se pueden pasar los tres archivos o solo algunos, en cualquier orden: el tipo se reconoce por el contenido. Conviene pasar siempre los tres juntos, porque el Excel une a las personas por nombre contra las que traen los Access. El `.mdb` tiene contraseña, pero no hace falta: no cifra los datos.

## Pasos recomendados

1. **Backup** de la base de producción (`pg_dump`) antes de aplicar nada.
2. **Simulación**, sin opciones. Leer `resumen.md` y `incidencias.csv` en la carpeta del informe.
3. Mirar en el resumen la sección **"Catálogos que faltan en la base"**. Si hay que crearlos, acordarlo con liquidación y simular de nuevo con `--crear-catalogos`.
4. Mirar el conteo **"activos no creados"**. Si se van a crear, acordarlo con liquidación y simular con `--crear-activos`.
5. Corregir en el Access o el Excel lo que se pueda de `incidencias.csv` y volver a simular.
6. **Aplicar**: repetir el mismo comando de la última simulación agregando `--aplicar`.
7. Las filas que quedaron en `incidencias.csv` se cargan a mano desde el sistema.

## El informe

- **`resumen.md`**: qué se cargó (o cargaría), conteos, catálogos que faltan, e incidencias agrupadas por motivo.
- **`incidencias.csv`**: una fila por incidencia, con archivo, hoja o tabla, número de fila, cédula, nombre y motivo. Se abre con Excel.
  - **ERROR**: la fila no se cargó.
  - **aviso**: la fila se cargó con alguna salvedad, o no se cargó a propósito (por ejemplo, un activo sin `--crear-activos`).

**El informe tiene datos personales reales**: guardarlo con el mismo cuidado que los archivos de la FAU.

## Reglas de conversión

Los alias de grados, escalafones y destinos están en `catalogos.ts`. En resumen:

- **Cédula:** se valida el dígito verificador. Si falla y hay cédula sin verificador (`CED_PERS`), se reconstruye desde esa.
- **`ESTA`:** 0 es activo; -1 es baja o retiro.
- **Filas de subalternos:** cada fila es un período de servicio, no una persona. Una persona puede tener varios (reingresos, cambio de escalafón, paso de cadete a soldado), y como mucho uno activo. Los oficiales que también figuran en subalternos (su paso como cadetes por la EMA o como ex-subalternos) quedan como una sola persona, unificada por cédula, con toda su historia.
- **"Retiro en Trámite" y "Trámite NO Disponible" no son destinos:**
  - Retiro en trámite: la persona sigue en su unidad, que se toma de `Numero Destino`. Situación SIT01.
  - Trámite NO Disponible (TND): depende del Comando General. Unidad C.G.F.A. y situación SIT04.
- **Situación:**
  - Oficial: SIT01; en TND, SIT04.
  - Subalterno: SIT07.
  - Cadete o aspirante: SIT12.
  - Reincorporado (REIN): SIT17.
  - Reservista (RVA): SIT08.
- **Régimen:** Ley 19.695, la misma regla que usa liquidación.
- **Programa:** 300.
- **Sin escalafón:**
  - Cadetes y aspirantes: `CADETE`.
  - Aerotécnicos: A.T., que se infiere del grado.
  - Reincorporados (REIN): el escalafón de otro período de la misma persona; si no tiene, como cualquier fila sin escalafón.
  - El resto: `SIN_DATO`, para completar a mano.
- **Fechas:** se aceptan `dd/mm/aaaa` y las variantes `d/m/aa` y `dd//aaaa`. Los años fuera de 1900-2100 son errores de tipeo: la fecha queda vacía.
- **Excel de horas de vuelo:** las columnas se leen por nombre, con alias, no por posición: los encabezados cambian entre hojas. Solo las hojas de 2020 traen cédula; el resto se une por nombre.
- **Unión por nombre en el Excel:** nombre completo, apellidos y primer nombre, o apellidos e inicial, siempre que el resultado sea una sola persona; si hay más de una, la fila va al informe. Si solo coincide el primer apellido y el nombre, queda como sugerencia: medido sobre datos de 2020, ese criterio se equivoca el 18% de las veces.
- **Cédulas cruzadas:** en las hojas que traen cédula, si el nombre no coincide con la persona de esa cédula, la fila no se carga y va al informe. En 2020 hay parejas de personas con la cédula de la otra.
- **Derecha y Numor:** se cargan solo si no los tiene ya otra persona (son únicos). Si no, quedan vacíos y se avisa.

## Decisiones confirmadas con la FAU

- **Código y texto:** cuando un dato viene como código y como texto, manda el texto. Los códigos numéricos del Access son inconsistentes.
- **Columnas que no se usan:** `COD_SIT`, `TIPO` y `CODIGO`. El importador no las lee.
- **Prima técnica (`ABRE_PT`):** A, B o C. `O` y cualquier otro valor se cargan como `VACIO`. `ORDENCGFA` es la orden de la prima técnica, no la del destino, y no se importa.
- **`DESNUM`** es la lista de unidades vigentes. Se usa para nombrar las unidades que se crean.
- **S.I.R.F.A.** es una unidad vieja que ya no se usa: el curso de instrucción al recluta (CIRFA). Se carga como unidad no vigente.
- **(Adm.)** es un escalafón que ya no está vigente: solo aparece en bajas. Se carga como no vigente.
- **B.F.A.** es la Banda de la Fuerza Aérea: es escalafón (`BM`) y también destino.
- **DIR.PERS.CÁ. "A", "B" y "C"** son categorías de la Dirección de Personal: van como sub-unidades de esa unidad.
- **D.C.I.** (Dirección de Comunicación Institucional), **D.S.O.** (División de Seguridad Ocupacional) y **ESMADE** (Estado Mayor de la Defensa, fuera de la FAU) son destinos válidos.
- **A/T 1º y A/T 2º** son At. 1.ª y At. 2.ª: aerotécnicos, aunque figuren en la E.T.A.
- **Cadetes de la EMA:** ASP. es el primer año y CAD.3º el último.

## Copias anonimizadas

El importador se desarrolló y se probó con copias anonimizadas de los archivos de la FAU, nunca con los originales.

**Por qué.** Los originales tienen datos que identifican a personas: nombres, cédulas, domicilios, teléfonos, fechas de nacimiento y datos de familiares. Para construir el importador hacía falta saber cómo están cargados los datos (formatos, abreviaturas, errores de carga), pero sin que nadie del equipo ni las herramientas de IA usadas como asistentes de programación vieran un dato personal.

**Cómo se trabajó.**
- Los originales nunca entraron al proyecto ni se modificaron.
- Los scripts que leen los originales los corrió solo la persona responsable, en su computadora. Solo muestran conteos, nombres de columnas, valores de catálogo (cada columna por separado, sin el resto de la fila) y el formato de los datos sensibles, con los dígitos cambiados por 9 y las letras por A.
- La IA escribió esos scripts, pero nunca los ejecutó sobre los originales: los probó con bases ficticias de datos inventados. Así, ni un mensaje de error ni una depuración podían mostrar un dato real.

**Cómo se generó la copia.**
- Se crea una base nueva y vacía, y se copia solo lo que está en una lista de permitidos. Una columna que no figura en la lista no se copia.
- **Cédulas:** se cambian por cédulas falsas con dígito verificador válido. Cada persona tiene la misma cédula falsa en todas las tablas y en los tres archivos, para que los cruces sigan funcionando. Si la cédula original tenía mal el verificador, la falsa también, para probar ese caso.
- **Nombres:** se cambian por palabras inventadas con la misma forma. La misma palabra real da siempre la misma inventada, así que se puede probar la unión por nombre del Excel.
- **Fechas:** todas las fechas de una persona se corren la misma cantidad de días al azar. Se mantienen los intervalos (por ejemplo, entre ingreso y ascenso), pero ninguna fecha es real.
- **Domicilio, teléfono y correo:** caracteres al azar con el mismo formato.
- **Texto libre y datos de familiares:** se eliminan, porque pueden tener nombres escritos a mano.
- **Grados, escalafones, destinos y códigos:** se copian tal cual, porque son lo que hace falta para el mapeo.
- Todo lo inventado se compara contra los datos reales antes de escribirse. Si coincide por azar, se genera otro valor.

**Garantías.**
- No se puede revertir: la correspondencia entre datos reales y falsos existe solo en memoria mientras corre el proceso, con una clave al azar que no se guarda.
- Antes de usar una copia, un script de verificación la compara con el original. Busca cédulas reales en cualquier celda (también con puntos y guion o dentro de otro texto), nombres reales, columnas fuera de la lista y datos en campos que debían quedar vacíos. La copia solo se usó con todo en cero. También se comprobó que la verificación detecta filtraciones insertadas a propósito.

**Qué implica para el importador.**
- Las copias sirven para probar que el importador funciona, no para validar el contenido real. Lo que en las copias queda vacío o alterado (texto libre, familiares, agrupación de misiones) se probó con datos inventados.
- Las cédulas de las copias son falsas pero válidas, así que podrían cargarse como si fueran reales. Por eso **el importador se niega a cargarlas** salvo en una base cuyo nombre contenga "test" o "prueba".

## Misiones

- **Una misión** = mismo texto, mismo país y mismas fechas de salida y regreso. Las filas de cada persona que viajó se juntan en una sola misión, con cada una como participante.
  - Si la fila no trae texto, el nombre se arma: "Salida al exterior (País)".
  - Si la misión ya está en la base (mismo nombre, país y fechas), se le agregan los participantes que falten.
- **`OFICIALES EN MISION`** es una versión vieja de `xsalida`: solo se toman sus filas que no estén en `xsalida`.
- De `xsalida`, las resoluciones (con su fecha) y la fecha de la orden van en observaciones.
- **`Misiones`** trae las misiones largas (de paz, diplomáticas, oficiales). Va en el tipo de misión. Si está en el país, la orden modificativa y la resolución van en observaciones.
- **Una persona sin nombre en ningún archivo no se crea** (pasa con muchos retirados que solo aparecen en las salidas). Sus participaciones van al informe. Si ya existe en la base (por ejemplo, cargada por liquidación), se le asignan.
- Con las copias anonimizadas no se pudo verificar cómo se agrupan los participantes: la anonimización corre las fechas de cada persona por separado y vacía el texto de la misión. Con los archivos reales, revisar en la simulación que el número de misiones sea razonable.

## Nivel educativo

El Access lo trae como texto libre. Se convierte a los valores del sistema (`PRIMARIA`, `CICLO_BASICO_INCOMPLETO`, `CICLO_BASICO`, `BACHILLERATO_INCOMPLETO`, `BACHILLERATO`…). Lo que no se puede interpretar se informa y no se carga: textos como "UTU incompleta", "Secundaria incompleta" o una fecha escrita en ese campo.

## Cursos de pasaje de grado

Son requisito de las reglas de ascenso de subalternos y aerotécnicos, que los piden aprobados.
- `CSOCBO2ª-CBO1ª` → "Curso de Pasaje de Grado de Cbo. 2.ª para Cbo. 1.ª (M-02)".
- `CSOSGTO-SGTO1º` → "Curso de Pasaje de Grado de Sgto. para Sgto. 1ro. (M-03)".
- El curso se busca por ese nombre (el de `seed_ascensos.sql`). Si la base no lo tiene, se crea sin unidad, igual que en el seed.
- Se carga como **aprobado** cuando el texto empieza con "SI", es solo un año ("2006") o es directamente el acta ("CCETA N° 1234/24"). Lo que sigue al "SI (año)" (acta, CETA, memo) va en el número de orden. El texto original queda en la observación.
- **No se carga una fecha**: el Access trae solo el año, que queda en la observación.
- "Mutación O.C.G.F.A. …" no se carga: la mutación exime del curso, no es haberlo hecho. Va al informe como aviso, igual que cualquier otro texto que no diga que lo aprobó.
- El curso de Cbo. 1.ª a Sgto. no tiene columna en el Access.

### Cursos de Nivel 7 y 9

El nivel de pericia (`NIVEL_PER`) 7 o 9 se obtiene aprobando su curso o presentando el certificado de uno equivalente. El Access no dice cuál de las dos fue, así que se carga el curso del nivel y la observación lo aclara. Los dos cursos son requisito de ascenso.
- Nivel 7 → "Curso de Formación de Instructores (Nivel 7)". El acta sale de `ACTA DE NIVEL 7`, donde 0 significa sin dato.
- Nivel 9 → "Curso de Formación de Supervisores (Nivel 9)", **y también el de Nivel 7**: al 9 se llega desde Sgto. 1.º / Inst. AT, grado que ya exige el de instructores. El acta del 9 no tiene columna.
- Niveles 0, 3 y 5: no se carga ningún curso.

### Especialidades y CURSOS ETA

El sistema no tiene un campo de especialidad, y la especialidad se obtiene aprobando un curso: se carga como curso aprobado "Especialidad: …".
- Son texto libre con cientos de variantes. `especialidades.ts` tiene un catálogo curado: cada patrón agrupa las formas de escribir la misma especialidad. Un texto que nombra dos ("POLICIA AEREA DEFENSA DE INSTALACIONES") carga las dos.
- Lo que no coincide con ningún patrón va al informe como aviso. Para sumar una variante, agregarla al patrón que corresponda.
- No se cargan ni se informan los títulos profesionales (Doctor en Medicina, Abogada…) ni "NO TIENE C.I.R." / "SIN CURSO".
- `ABRE_ESP` lleva el acta (`ACTA_ESP`) y la fecha (`FECHA_ESP`); `ESPEC2` y `CURSOS ETA`, no.
- Los textos que nombran cursos de ascenso (Nivel 7, Supervisores, pasaje a Sgto. 1.º) van a esos cursos.

## Servicio anterior

- Si `FUERZA 1` es otra fuerza (Ejército, Armada…), los años completos entre `FECHA INGRESO ANTERIOR` y `FECHA BAJA` van a `anios_servicio_anterior`, que usa la elegibilidad de ascensos. **Solo en períodos inactivos**: en uno activo cambia la elegibilidad y podría cambiar lo que liquida, así que va al informe.
- Si `FUERZA 1` nombra a la FAU (C.G.F.A., F.A.U., una base, la banda), es un período anterior en la misma fuerza: no suma años.
- En los dos casos, el servicio anterior completo (fuerza, fechas, `FUERZA 2`, reingreso, baja anterior) queda en observaciones del período.

## Retiros y motivos de baja

`motivos.ts` pasa el texto libre de `MOTIVO` al catálogo `motivos_baja`. Las reglas salen de los textos más frecuentes del original y cubren el 98% de ellos.
- "Solicitarla" → `BAJA_SOLICITADA` (motivo nuevo): la FAU confirmó que es una baja solicitada, no un retiro voluntario.
- "Cumplido y solicitarla" → `CUMPLIDO_SOLICITADA` (motivo nuevo): es otra causal. "Cumplido" solo → `TERMINO_CONTRATO`.
- El texto original queda siempre tal cual, en las observaciones del período y en el `motivo` del retiro.
- La conducta del final del texto ("CONDUCTA BUENA", "C/MALA") va a `relaciones_laborales.conducta` ("Buena", "Mala"), solo en períodos de baja. Es una columna de este sistema que liquidación no conoce.
- Retiro obligatorio → `RETIRO_OBL`; fallecimiento, incapacidad; faltas, deserción o faltar a lista → `MALA_CONDUCTA`; "cumplido" o no renovación del contrato → `TERMINO_CONTRATO`; pase al Ministerio del Interior o cese → `CESE`.
- Motivos nuevos, **vigentes** (se siguen usando): `BAJA_SOLICITADA`, `CUMPLIDO_SOLICITADA`, `NO_ADAPTACION` (no adaptarse a la vida militar, no asimilar la instrucción) y `NO_APTO` (examen psicofísico). Aparecen para elegir al dar una baja, en este sistema y en el de liquidación.
- "Ascenso a Alférez" y el cambio de unidad ejecutora **no son retiros**: el período queda de baja, sin retiro.
- Lo que no se reconoce ("EGRESO", "CUERPO ALUMNO", "RETIRO" sin más) va al informe y no se crea el retiro.
- El retiro lleva la fecha de baja, el motivo, el texto original, el acta u O.C.G.F.A. como número de orden y el B.M.D.N. como boletín.
- **Ningún cálculo cambia según el motivo**, ni en liquidación ni acá: solo RETIRO_OBL / RETIRO_VOL se registran como movimiento "Retiro" (el resto, "Baja"), y el aguinaldo por baja sale de `movimientos_laborales`, que el importador no crea.

## Familiares

Como el alta de la aplicación: un familiar civil es una persona con `es_civil = true` vinculada al militar; si la cédula ya es de alguien, solo se vincula.
- **Esposa** (`C-I- Esposa`): solo se vincula si ya está en la base (por ejemplo, es funcionaria), como "Cónyuge". No se crea: el nombre viene sin coma y no se puede separar en nombres y apellidos. Si se vincula, `Fecha de Nac Esposa` completa su fecha de nacimiento si está vacía.
- **Hijos** (`Nombre de los Hijos`, `Cédula Hijos`, `Fecha Nac Hijos`): varios por celda, separados por guion, coma o barra, y se alinean por orden. Si la cantidad de nombres y de cédulas no coincide, va al informe.
  - Si el hijo ya está en la base, se vincula como "Hijo/a".
  - Si no, se crea como civil con el **primer apellido del oficial** (el Access trae solo el nombre de pila) y se vincula: desde el hijo, el oficial es "Padre". Si la oficial es mujer, el apellido no se sabe y el hijo no se crea.
- En las copias estas columnas están vacías: se probó con datos inventados.

## Historial de ascensos

Son registros históricos: no tienen relaciones laborales ni orden de ascenso asociadas, así que la aplicación los muestra en el historial y en los reportes, pero no deja anularlos. No tocan nada de liquidación.
- **Oficiales:** `xescala` trae el año en que llegó a cada grado (`Tte2`, `Tte1`, `Cap`, `May`, `TteCnel`, `Cnel`, `BrigGral`, `Gral del Aire`). Cada año es un ascenso desde el grado de la columna anterior con dato.
  - **La fecha es el 1/1 de ese año**, porque el Access no trae el día. La observación lo aclara. Así quedan bien ordenados en el perfil y cuentan en las estadísticas del año correcto.
  - `Alf` no es un ascenso: es el egreso de la EMA, el grado de partida.
  - No se usan `Orden Asc`, `Bol Asc`, `Resol Asc` ni `Fech Resol Asc`: no se pudo comprobar a qué ascenso corresponden.
- **Subalternos:** `FEC_GRA` es la fecha en que llegó al grado del período. Si es posterior al ingreso (y anterior a la baja), es un ascenso a ese grado. El grado anterior es el que está antes en su escala (Sdo. 2.ª → Sdo. 1.ª → Cbo. 2.ª → … → S.O.M.; At. 2.ª → … → Supv. AT).
  - No se registra el ascenso cuando el grado es el primero de su escala (At. 2.ª: se llega egresando de la ETA o por mutación) ni en cadetes y At. 3.ª.
  - Si `FEC_GRA` coincide con el ingreso, entró con ese grado: no es un ascenso.

## Lo que no se importa

- **`fecha_ultimo_ascenso` de oficiales** en la relación laboral: el Access trae solo el año, y liquidación calcula la permanencia desde esa fecha.
- **Nivel de pericia** (`NIVEL_PER`) como dato propio: el sistema no tiene un campo para eso. Solo se cargan los cursos que implica (7 y 9).
- **Esposas que no están en la base**: el nombre viene sin coma y no se puede separar con seguridad. Se cargan a mano desde la aplicación.
- **Vivienda** y los títulos profesionales que aparecen como especialidad.
- **Datos sin campo en el sistema:** egreso de la EMA, títulos, Liceo Militar, credencial cívica, fecha de prima técnica, fecha de retiro obligatorio, piloto principal/comandante.
- **Fechas de ingreso y egreso de la ETA** en el legajo: falta que la FAU confirme de qué columnas salen.
- **Tablas `HORAS DE VUELO` y `2do Período 2026` del Access de oficiales:** el Excel de horas de vuelo trae lo mismo.
- **Registro en la bitácora de auditoría.**

import { Borders, Cell, Workbook, Worksheet } from 'exceljs';
import { ColumnaPlantilla, DefinicionPlantilla, ListaPlantilla } from './carga-masiva.types.js';

/** Misma paleta que el Excel de reportes (`reportes.service.ts`). */
const AZUL = 'FF132744';
const BLANCO = 'FFFFFFFF';
const GRIS_BORDE = 'FFDBE2EC';
const GRIS_TEXTO = 'FF64748B';

/** Filas que se dejan preparadas con bordes, formato y listas desplegables. */
const FILAS_PREPARADAS = 500;

const HOJA_LISTAS = 'Listas';

export const marcaRequerida = (c: ColumnaPlantilla) => (c.requerida ? `${c.titulo} *` : c.titulo);

export async function construirPlantilla(def: DefinicionPlantilla): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'Sistema de Gestión de Personal FAU';

  const rangosListas = new Map<string, string>();
  const datos = wb.addWorksheet(def.hoja, { views: [{ state: 'frozen', ySplit: 1 }] });
  const instrucciones = wb.addWorksheet('Instrucciones');
  const ejemplo = def.ejemplos?.length ? wb.addWorksheet('Ejemplo', { views: [{ state: 'frozen', ySplit: 1 }] }) : null;

  if (def.listas?.length) {
    const hojaListas = wb.addWorksheet(HOJA_LISTAS, { views: [{ state: 'frozen', ySplit: 1 }] });
    agregarListas(hojaListas, def.listas, rangosListas);
  }

  agregarHojaDatos(datos, def.columnas, rangosListas);
  agregarInstrucciones(instrucciones, def);
  if (ejemplo) agregarEjemplo(ejemplo, def.columnas, def.ejemplos!);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function agregarHojaDatos(ws: Worksheet, columnas: ColumnaPlantilla[], rangos: Map<string, string>) {
  ws.columns = columnas.map((c) => ({ key: c.clave, width: anchoColumna(c) }));
  agregarEncabezado(ws, columnas);

  columnas.forEach((col, i) => {
    const columna = ws.getColumn(i + 1);
    if (col.tipo === 'fecha') columna.numFmt = 'dd/mm/yyyy';
    // Texto explícito: si no, Excel le saca los ceros a la izquierda a cédulas y teléfonos.
    if (!col.tipo || col.tipo === 'texto') columna.numFmt = '@';
  });

  for (let fila = 2; fila <= FILAS_PREPARADAS + 1; fila++) {
    const row = ws.getRow(fila);
    columnas.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      cell.border = bordeFino();
      aplicarValidacion(cell, col, rangos);
    });
  }
}

function aplicarValidacion(cell: Cell, col: ColumnaPlantilla, rangos: Map<string, string>) {
  if (col.tipo === 'lista' && col.lista && rangos.has(col.lista)) {
    const estricta = col.listaEstricta !== false;
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [rangos.get(col.lista)!],
      showErrorMessage: estricta,
      errorStyle: 'stop',
      errorTitle: col.titulo,
      error: 'Elegí un valor de la lista desplegable.',
    };
  } else if (col.tipo === 'fecha') {
    cell.dataValidation = {
      type: 'date',
      operator: 'greaterThan',
      allowBlank: true,
      formulae: [new Date(Date.UTC(1900, 0, 1))],
      showErrorMessage: true,
      errorTitle: col.titulo,
      error: 'Ingresá una fecha válida (dd/mm/aaaa).',
    };
  } else if (col.tipo === 'numero') {
    cell.dataValidation = {
      type: 'whole',
      operator: 'greaterThanOrEqual',
      allowBlank: true,
      formulae: [0],
      showErrorMessage: true,
      errorTitle: col.titulo,
      error: 'Ingresá un número entero mayor o igual a 0.',
    };
  }
}

function agregarListas(ws: Worksheet, listas: ListaPlantilla[], rangos: Map<string, string>) {
  ws.columns = listas.map((l) => ({
    key: l.nombre,
    width: Math.min(Math.max(l.titulo.length, ...l.valores.map((v) => v.length), 10) + 2, 60),
  }));

  const header = ws.addRow(listas.map((l) => l.titulo));
  header.height = 20;
  estiloEncabezado(header);

  const alto = Math.max(...listas.map((l) => l.valores.length), 0);
  for (let i = 0; i < alto; i++) {
    const row = ws.addRow(listas.map((l) => l.valores[i] ?? ''));
    row.eachCell((cell, col) => {
      if (i < listas[col - 1].valores.length) cell.border = bordeFino();
    });
  }

  listas.forEach((l, i) => {
    const letra = ws.getColumn(i + 1).letter;
    // Una lista vacía igual necesita un rango válido para la validación.
    const ultima = Math.max(l.valores.length, 1) + 1;
    rangos.set(l.nombre, `${HOJA_LISTAS}!$${letra}$2:$${letra}$${ultima}`);
  });
}

function agregarInstrucciones(ws: Worksheet, def: DefinicionPlantilla) {
  ws.columns = [{ width: 32 }, { width: 13 }, { width: 34 }, { width: 70 }];

  const titulo = ws.addRow([def.titulo]);
  titulo.getCell(1).font = { bold: true, size: 14, color: { argb: AZUL } };
  titulo.height = 24;

  const generales = [
    `Completá una fila por registro en la hoja "${def.hoja}". No cambies los títulos de las columnas.`,
    'Las columnas marcadas con * son obligatorias.',
    'Las columnas con flecha tienen una lista desplegable: elegí el valor de la lista. Los valores posibles están en la hoja "Listas".',
    'Las fechas se escriben como fecha de Excel (por ejemplo 15/05/1990).',
    ...(def.ejemplos?.length ? ['La hoja "Ejemplo" muestra filas completas de referencia. No se importa.'] : []),
    ...(def.instrucciones ?? []),
  ];
  for (const texto of generales) {
    const row = ws.addRow([texto]);
    ws.mergeCells(row.number, 1, row.number, 4);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(1).font = { color: { argb: GRIS_TEXTO } };
    // Las cuatro columnas unidas entran ~180 caracteres por renglón.
    row.height = Math.ceil(texto.length / 180) * 15 + 3;
  }

  ws.addRow([]);
  const header = ws.addRow(['Columna', 'Obligatoria', 'Formato', 'Descripción']);
  header.height = 20;
  estiloEncabezado(header);

  for (const col of def.columnas) {
    const row = ws.addRow([col.titulo, col.requerida ? 'Sí' : 'No', formato(col, def.listas), col.ayuda ?? '']);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = bordeFino();
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  }
}

function agregarEjemplo(ws: Worksheet, columnas: ColumnaPlantilla[], ejemplos: Record<string, string | number | Date>[]) {
  ws.columns = columnas.map((c) => ({ key: c.clave, width: anchoColumna(c) }));
  agregarEncabezado(ws, columnas);
  columnas.forEach((col, i) => {
    if (col.tipo === 'fecha') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
  });
  for (const ej of ejemplos) {
    const row = ws.addRow(columnas.map((c) => ej[c.clave] ?? ''));
    columnas.forEach((_, i) => {
      row.getCell(i + 1).border = bordeFino();
    });
  }
}

function agregarEncabezado(ws: Worksheet, columnas: ColumnaPlantilla[]) {
  const header = ws.addRow(columnas.map(marcaRequerida));
  header.height = 30;
  estiloEncabezado(header);
  columnas.forEach((c, i) => {
    if (c.ayuda) header.getCell(i + 1).note = c.ayuda;
  });
}

function estiloEncabezado(header: ReturnType<Worksheet['addRow']>) {
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    cell.font = { color: { argb: BLANCO }, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = bordeFino();
  });
}

function formato(col: ColumnaPlantilla, listas?: ListaPlantilla[]): string {
  if (col.tipo === 'fecha') return 'Fecha (dd/mm/aaaa)';
  if (col.tipo === 'numero') return 'Número entero';
  if (col.tipo === 'lista') {
    const lista = listas?.find((l) => l.nombre === col.lista);
    const libre = col.listaEstricta === false ? ' o texto nuevo' : '';
    if (lista && lista.valores.length <= 6) return `Lista: ${lista.valores.join(' / ')}${libre}`;
    return `Lista desplegable (hoja "Listas", columna "${lista?.titulo ?? col.titulo}")${libre}`;
  }
  return 'Texto';
}

function anchoColumna(c: ColumnaPlantilla): number {
  return c.ancho ?? Math.min(Math.max(marcaRequerida(c).length + 4, 14), 40);
}

function bordeFino(): Partial<Borders> {
  const color = { argb: GRIS_BORDE };
  return {
    top: { style: 'thin', color },
    left: { style: 'thin', color },
    bottom: { style: 'thin', color },
    right: { style: 'thin', color },
  };
}

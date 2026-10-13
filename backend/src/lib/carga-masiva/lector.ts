import { BadRequestException } from '@nestjs/common';
import { CellValue, Workbook } from 'exceljs';
import { ColumnaPlantilla, DefinicionPlantilla, FilaLeida } from './carga-masiva.types.js';
import { normalizar } from './valores.js';

/** Tope de filas por archivo: la carga procesa en serie y no debería exceder el timeout HTTP. */
export const MAX_FILAS = 3000;

/** Mapea las columnas por título y no por posición, así no se corren si alguien las mueve. */
export async function leerHoja(buffer: Buffer, def: DefinicionPlantilla): Promise<FilaLeida[]> {
  const wb = new Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('No se pudo leer el archivo. Tiene que ser un Excel .xlsx.');
  }

  const ws = wb.getWorksheet(def.hoja);
  if (!ws) {
    throw new BadRequestException(
      `El archivo no tiene la hoja "${def.hoja}". Descargá la plantilla actualizada y volvé a intentar.`,
    );
  }

  const porTitulo = new Map(def.columnas.map((c) => [normalizarTitulo(c.titulo), c]));
  const columnaPorIndice = new Map<number, ColumnaPlantilla>();
  ws.getRow(1).eachCell((cell, col) => {
    const columna = porTitulo.get(normalizarTitulo(textoDe(cell.value)));
    if (columna) columnaPorIndice.set(col, columna);
  });

  const presentes = new Set([...columnaPorIndice.values()].map((c) => c.clave));
  const faltantes = def.columnas.filter((c) => c.requerida && !presentes.has(c.clave));
  if (faltantes.length) {
    throw new BadRequestException(
      `Faltan columnas obligatorias: ${faltantes.map((c) => c.titulo).join(', ')}. ` +
        'Descargá la plantilla actualizada y volvé a intentar.',
    );
  }

  const filas: FilaLeida[] = [];
  ws.eachRow({ includeEmpty: false }, (row, numero) => {
    if (numero === 1) return;
    const valores: Record<string, string> = {};
    for (const [indice, columna] of columnaPorIndice) {
      valores[columna.clave] = convertir(row.getCell(indice).value, columna);
    }
    if (Object.values(valores).some((v) => v !== '')) {
      filas.push({ fila: numero, valores });
    }
  });

  if (filas.length === 0) {
    throw new BadRequestException(
      `La hoja "${def.hoja}" no tiene datos. Completá al menos una fila debajo de los títulos.`,
    );
  }
  if (filas.length > MAX_FILAS) {
    throw new BadRequestException(
      `El archivo tiene ${filas.length} filas y el máximo es ${MAX_FILAS}. Dividilo en varios archivos.`,
    );
  }
  return filas;
}

/** Ignora el asterisco de obligatoria, mayúsculas, tildes y espacios de más. */
function normalizarTitulo(titulo: string): string {
  return normalizar(titulo.replace(/\*/g, ''));
}

function convertir(valor: CellValue, columna: ColumnaPlantilla): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return fechaIso(valor);
  if (typeof valor === 'number') {
    // Una fecha sin formato de fecha llega como número de serie de Excel.
    if (columna.tipo === 'fecha' && valor > 1 && valor < 100000) {
      return fechaIso(new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86_400_000));
    }
    return String(valor);
  }
  if (typeof valor === 'boolean') return valor ? 'SI' : 'NO';
  return textoDe(valor).trim();
}

function textoDe(valor: CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor !== 'object') return String(valor);
  if (valor instanceof Date) return fechaIso(valor);
  if ('richText' in valor) return valor.richText.map((r) => r.text).join('');
  if ('text' in valor) return String(valor.text);
  if ('result' in valor) return valor.result === undefined ? '' : textoDe(valor.result as CellValue);
  return '';
}

/** Excel guarda la fecha sin zona: exceljs la expone como medianoche UTC. */
function fechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

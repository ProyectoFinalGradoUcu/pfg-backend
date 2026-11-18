import { Workbook } from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { DefinicionPlantilla } from './carga-masiva.types';
import { construirPlantilla } from './plantilla';
import { leerHoja } from './lector';
import { Catalogo, normalizarCedula, parsearFecha, parsearSiNo, procesarEnSerie, resumir, separarRepetidas } from './valores';

const DEF: DefinicionPlantilla = {
  hoja: 'Datos',
  titulo: 'Prueba',
  columnas: [
    { clave: 'cedula', titulo: 'Cédula', requerida: true },
    { clave: 'grado', titulo: 'Grado', tipo: 'lista', lista: 'grados' },
    { clave: 'fecha', titulo: 'Fecha de inicio', tipo: 'fecha' },
  ],
  listas: [{ nombre: 'grados', titulo: 'Grado', valores: ['CAP — Cap.', 'MAY — May.'] }],
  ejemplos: [{ cedula: '11111111', grado: 'CAP — Cap.' }],
};

async function libro(encabezados: string[], filas: unknown[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Datos');
  ws.addRow(encabezados);
  filas.forEach((f) => ws.addRow(f));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('carga masiva · valores', () => {
  it('parsearFecha acepta AAAA-MM-DD y DD/MM/AAAA', () => {
    expect(parsearFecha('1990-05-15', 'F')).toBe('1990-05-15');
    expect(parsearFecha('15/05/1990', 'F')).toBe('1990-05-15');
    expect(parsearFecha('', 'F')).toBeUndefined();
  });

  it('parsearFecha rechaza fechas imposibles con el nombre de la columna', () => {
    expect(() => parsearFecha('31/02/2020', 'Fecha de nacimiento')).toThrow('Fecha de nacimiento');
    expect(() => parsearFecha('mañana', 'F')).toThrow('no es una fecha válida');
  });

  it('parsearSiNo entiende variantes y rechaza el resto', () => {
    expect(parsearSiNo('Sí', 'X')).toBe(true);
    expect(parsearSiNo('no', 'X')).toBe(false);
    expect(() => parsearSiNo('quizás', 'X')).toThrow('SI o NO');
  });

  it('normalizarCedula saca puntos y guión', () => {
    expect(normalizarCedula('1.234.567-8')).toBe('12345678');
  });

  describe('Catalogo', () => {
    const cat = new Catalogo('Grado', [
      { id: 1n, codigo: 'TTE_1RO', nombre: 'Tte. 1°' },
      { id: 2n, codigo: 'CAP', nombre: 'Cap.' },
    ]);

    it('arma la etiqueta "CÓDIGO — Nombre" para la lista desplegable', () => {
      expect(cat.etiquetas).toEqual(['TTE_1RO — Tte. 1°', 'CAP — Cap.']);
    });

    it('resuelve por etiqueta, por código o por nombre, sin importar mayúsculas ni tildes', () => {
      expect(cat.resolver('TTE_1RO — Tte. 1°').id).toBe(1n);
      expect(cat.resolver('cap').id).toBe(2n);
      expect(cat.resolver('tte. 1°').id).toBe(1n);
      expect(cat.resolver('CAP - nombre viejo').id).toBe(2n);
    });

    it('rechaza un valor que no está en la lista', () => {
      expect(() => cat.resolver('Coronel')).toThrow('"Grado": "Coronel" no existe');
    });

    it('desambigua con el id dos items de igual nombre y no los resuelve por nombre', () => {
      const repetidos = new Catalogo('Curso', [
        { id: 7n, codigo: null, nombre: 'Taller' },
        { id: 9n, codigo: null, nombre: 'Taller' },
      ]);
      expect(repetidos.etiquetas).toEqual(['Taller (#7)', 'Taller (#9)']);
      expect(repetidos.resolver('Taller (#9)').id).toBe(9n);
      expect(() => repetidos.resolver('Taller')).toThrow('ambiguo');
    });
  });

  it('procesarEnSerie sigue después de un error y resumir ordena por fila', async () => {
    const filas = [
      { fila: 3, valores: { cedula: '3' } },
      { fila: 2, valores: { cedula: '2' } },
    ];
    const resultados = await procesarEnSerie(filas, async (f) => {
      if (f.fila === 3) throw new Error('mal');
      return { id: 10n, mensaje: 'bien' };
    });
    const r = resumir(resultados);
    expect(r).toEqual({
      total: 2,
      exitosos: 1,
      errores: 1,
      resultados: [
        { fila: 2, cedula: '2', estado: 'ok', id: 10, mensaje: 'bien' },
        { fila: 3, cedula: '3', estado: 'error', mensaje: 'mal' },
      ],
    });
  });

  it('separarRepetidas marca la segunda aparición con la fila de la primera', () => {
    const { unicas, repetidas } = separarRepetidas(
      [
        { fila: 2, valores: { cedula: '1' } },
        { fila: 3, valores: { cedula: '1' } },
      ],
      (f) => f.valores['cedula'],
      (previa) => `repetida en ${previa}`,
    );
    expect(unicas.map((f) => f.fila)).toEqual([2]);
    expect(repetidas).toEqual([{ fila: 3, cedula: '1', estado: 'error', mensaje: 'repetida en 2' }]);
  });
});

describe('carga masiva · plantilla y lector', () => {
  it('la plantilla trae la hoja de datos vacía, instrucciones, ejemplo y listas con validación', async () => {
    const wb = new Workbook();
    await wb.xlsx.load((await construirPlantilla(DEF)) as unknown as ArrayBuffer);

    expect(wb.worksheets.map((w) => w.name)).toEqual(['Datos', 'Instrucciones', 'Ejemplo', 'Listas']);
    const datos = wb.getWorksheet('Datos')!;
    expect(datos.getRow(1).getCell(1).value).toBe('Cédula *');
    expect(datos.getRow(1).getCell(1).fill).toMatchObject({ fgColor: { argb: 'FF132744' } });
    expect(datos.getRow(2).getCell(1).value).toBeNull();
    expect(datos.getRow(2).getCell(2).dataValidation).toMatchObject({ type: 'list', formulae: ['Listas!$A$2:$A$3'] });
  });

  it('lee una plantilla completada, con fechas reales de Excel', async () => {
    const buffer = await libro(['Cédula *', 'Grado', 'Fecha de inicio'], [
      ['12345678', 'CAP — Cap.', new Date(Date.UTC(2020, 0, 15))],
      [87654321, '', '01/02/2021'],
    ]);

    expect(await leerHoja(buffer, DEF)).toEqual([
      { fila: 2, valores: { cedula: '12345678', grado: 'CAP — Cap.', fecha: '2020-01-15' } },
      { fila: 3, valores: { cedula: '87654321', grado: '', fecha: '01/02/2021' } },
    ]);
  });

  it('mapea por título: el orden de las columnas no importa y las desconocidas se ignoran', async () => {
    const buffer = await libro(['Comentario', 'fecha de INICIO', 'cedula'], [['x', null, '11111111']]);

    expect(await leerHoja(buffer, DEF)).toEqual([{ fila: 2, valores: { cedula: '11111111', fecha: '' } }]);
  });

  it('una fecha que llega como número de serie se convierte', async () => {
    const buffer = await libro(['Cédula', 'Fecha de inicio'], [['1', 43845]]);

    expect((await leerHoja(buffer, DEF))[0].valores['fecha']).toBe('2020-01-15');
  });

  it('avisa si faltan columnas obligatorias o la hoja', async () => {
    await expect(leerHoja(await libro(['Grado'], [['CAP']]), DEF)).rejects.toThrow('Faltan columnas obligatorias: Cédula');

    const otra = new Workbook();
    otra.addWorksheet('Otra');
    await expect(leerHoja(Buffer.from(await otra.xlsx.writeBuffer()), DEF)).rejects.toThrow(BadRequestException);
  });

  it('rechaza un archivo sin filas de datos', async () => {
    await expect(leerHoja(await libro(['Cédula'], []), DEF)).rejects.toThrow('no tiene datos');
  });
});

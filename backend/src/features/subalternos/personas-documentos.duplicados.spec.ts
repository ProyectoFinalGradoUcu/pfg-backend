import {
  buscarDuplicado,
  buscarPorDescripcion,
  mensajeDuplicado,
  normalizarParaComparar,
} from './personas-documentos.duplicados';

const makeExistente = (overrides: Partial<any> = {}) => ({
  sha256: 'a'.repeat(64),
  nombre_original: 'Cédula.pdf',
  descripcion: 'Cédula frente' as string | null,
  ...overrides,
});

const makeNuevo = (overrides: Partial<any> = {}) => ({
  sha256: 'f'.repeat(64),
  nombre_original: 'otro.pdf',
  descripcion: null as string | null,
  ...overrides,
});

describe('normalizarParaComparar', () => {
  it('ignora acentos, mayúsculas y espacios de más', () => {
    expect(normalizarParaComparar('  Cédula   de IDENTIDAD ')).toBe('cedula de identidad');
  });
});

describe('buscarDuplicado', () => {
  it('null si no coincide nada', () => {
    expect(buscarDuplicado(makeNuevo(), [makeExistente()])).toBeNull();
  });

  it('contenido: mismo sha256 aunque cambien el nombre y la descripción', () => {
    const resultado = buscarDuplicado(
      makeNuevo({ sha256: 'a'.repeat(64), descripcion: 'Otra cosa' }),
      [makeExistente()],
    );
    expect(resultado?.motivo).toBe('contenido');
  });

  it('nombre: mismo nombre normalizado aunque el contenido sea distinto', () => {
    const resultado = buscarDuplicado(makeNuevo({ nombre_original: ' cedula.PDF' }), [
      makeExistente(),
    ]);
    expect(resultado?.motivo).toBe('nombre');
  });

  it('descripcion: misma descripción normalizada', () => {
    const resultado = buscarDuplicado(makeNuevo({ descripcion: 'cedula   FRENTE ' }), [
      makeExistente(),
    ]);
    expect(resultado?.motivo).toBe('descripcion');
  });

  it('una descripción nueva null no choca con otra null', () => {
    const resultado = buscarDuplicado(makeNuevo({ descripcion: null }), [
      makeExistente({ descripcion: null }),
    ]);
    expect(resultado).toBeNull();
  });

  it('prioridad: contenido gana sobre nombre y descripción', () => {
    const resultado = buscarDuplicado(
      makeNuevo({ sha256: 'a'.repeat(64), nombre_original: 'Cédula.pdf', descripcion: 'Cédula frente' }),
      [makeExistente()],
    );
    expect(resultado?.motivo).toBe('contenido');
  });

  it('prioridad: nombre gana sobre descripción, aunque sean de documentos distintos', () => {
    const porDescripcion = makeExistente({ sha256: 'b'.repeat(64), nombre_original: 'x.pdf' });
    const porNombre = makeExistente({
      sha256: 'c'.repeat(64),
      nombre_original: 'otro.pdf',
      descripcion: null,
    });
    const resultado = buscarDuplicado(makeNuevo({ descripcion: 'Cédula frente' }), [
      porDescripcion,
      porNombre,
    ]);
    expect(resultado?.motivo).toBe('nombre');
    expect(resultado?.existente).toBe(porNombre);
  });

  it('devuelve el existente tal cual, con sus campos extra', () => {
    const existente = { ...makeExistente(), fila: { id: 7n } };
    const resultado = buscarDuplicado(makeNuevo({ sha256: 'a'.repeat(64) }), [existente]);
    expect(resultado?.existente.fila).toEqual({ id: 7n });
  });
});

describe('buscarPorDescripcion', () => {
  it('encuentra el documento con la misma descripción normalizada', () => {
    const existente = makeExistente();
    expect(buscarPorDescripcion(' CEDULA   frente', [existente])).toBe(existente);
  });

  it('undefined si ninguno coincide, y los que no tienen descripción no cuentan', () => {
    expect(buscarPorDescripcion('Título', [makeExistente(), makeExistente({ descripcion: null })])).toBeUndefined();
  });
});

describe('mensajeDuplicado', () => {
  it('redacta un mensaje por motivo, con el dato del existente', () => {
    const existente = makeExistente();
    expect(mensajeDuplicado('contenido', existente)).toBe(
      'Este archivo ya está cargado para el funcionario',
    );
    expect(mensajeDuplicado('nombre', existente)).toBe(
      'Ya existe un documento con el nombre «Cédula.pdf»',
    );
    expect(mensajeDuplicado('descripcion', existente)).toBe(
      'Ya existe un documento con la descripción «Cédula frente»',
    );
  });
});

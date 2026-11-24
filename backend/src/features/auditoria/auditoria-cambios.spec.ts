import { calcularCambios, sinVacios, textoCodigo } from './auditoria-cambios';

describe('auditoria-cambios', () => {
  it('abre los resultados por persona en un cambio por campo', () => {
    const antes = { 'Sgto. Juan Pérez': { calificacion: null, aprobado: null, observacion: null } };
    const despues = { 'Sgto. Juan Pérez': { calificacion: 8, aprobado: 'Aprobado', observacion: null } };

    expect(calcularCambios(antes, despues)).toEqual([
      { campo: 'calificacion', etiqueta: 'Calificación de Sgto. Juan Pérez', anterior: null, nuevo: 8 },
      { campo: 'aprobado', etiqueta: 'Resultado de Sgto. Juan Pérez', anterior: null, nuevo: 'Aprobado' },
    ]);
  });

  it('una persona que aparece en el lote sale contra vacío', () => {
    expect(calcularCambios({}, { 'Cbo. Ana Gómez': { observacion: 'Faltó' } })).toEqual([
      { campo: 'observacion', etiqueta: 'Observación de Cbo. Ana Gómez', anterior: null, nuevo: 'Faltó' },
    ]);
  });

  it('nunca deja objetos como valor', () => {
    const cambios = calcularCambios({ cursos: [{ nombre: 'A', estado: 'ok' }] }, { cursos: [{ nombre: 'B', estado: null }] });

    expect(cambios).toEqual([{ campo: 'cursos', anterior: ['Nombre: A; Estado: ok'], nuevo: ['Nombre: B'] }]);
  });

  it('los campos sensibles se tapan', () => {
    expect(calcularCambios({ password: 'a' }, { password: 'b' })).toEqual([
      { campo: 'password', anterior: '***', nuevo: '***' },
    ]);
  });

  it('sin vacíos saca null, texto vacío y listas vacías', () => {
    expect(sinVacios({ a: null, b: '', c: [], d: false, e: 0, f: 'x', g: new Date('2026-01-02T00:00:00Z') })).toEqual({
      d: false,
      e: 0,
      f: 'x',
      g: '2026-01-02',
    });
  });

  it('código de enum a texto', () => {
    expect(textoCodigo('LICENCIA_SIN_GOCE')).toBe('Licencia sin goce');
    expect(textoCodigo('subalterno')).toBe('Subalterno');
    expect(textoCodigo(null)).toBeNull();
  });
});

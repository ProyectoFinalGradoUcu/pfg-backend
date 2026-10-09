import { construirObjectKey, sanearNombre } from './archivos.keys';

describe('sanearNombre', () => {
  it('baja a minúsculas, saca acentos y reemplaza espacios', () => {
    expect(sanearNombre('Boletín 042-2026.PDF')).toBe('boletin_042-2026.pdf');
  });

  it('descarta cualquier componente de path', () => {
    expect(sanearNombre('../../etc/passwd')).toBe('passwd');
    expect(sanearNombre('C:\\temp\\informe.pdf')).toBe('informe.pdf');
  });

  it('elimina los caracteres que no son seguros en una key', () => {
    expect(sanearNombre('re porte (final)#1.pdf')).toBe('re_porte_final1.pdf');
  });

  it('usa un nombre por defecto cuando no queda nada utilizable', () => {
    expect(sanearNombre('...')).toBe('archivo');
    expect(sanearNombre('###')).toBe('archivo');
  });

  it('corta los nombres muy largos sin perder la extensión', () => {
    const largo = `${'a'.repeat(300)}.pdf`;
    const resultado = sanearNombre(largo);
    expect(resultado).toHaveLength(104);
    expect(resultado.endsWith('.pdf')).toBe(true);
  });
});

describe('construirObjectKey', () => {
  it('arma el prefijo a partir de entidad, id y slot', () => {
    const key = construirObjectKey('misiones', 12n, 'boletin', 'Boletín 042.pdf');
    expect(key).toMatch(
      /^misiones\/12\/boletin\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-boletin_042\.pdf$/,
    );
  });

  it('un nombre con traversal no altera el prefijo', () => {
    const key = construirObjectKey('misiones', 12n, 'boletin', '../../../secreto.pdf');
    expect(key.startsWith('misiones/12/boletin/')).toBe(true);
    expect(key).not.toContain('..');
  });

  it('dos llamadas con el mismo nombre generan keys distintas', () => {
    const a = construirObjectKey('misiones', 12n, 'boletin', 'b.pdf');
    const b = construirObjectKey('misiones', 12n, 'boletin', 'b.pdf');
    expect(a).not.toBe(b);
  });
});

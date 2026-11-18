import { coincideMagicNumber, TIPOS_PERMITIDOS } from './archivos.mime';

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEXTO = Buffer.from('esto no es un pdf', 'utf8');

describe('TIPOS_PERMITIDOS', () => {
  it('son exactamente pdf, jpeg y png', () => {
    expect([...TIPOS_PERMITIDOS]).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
  });
});

describe('coincideMagicNumber', () => {
  it('acepta cada tipo permitido con su firma correcta', () => {
    expect(coincideMagicNumber(PDF, 'application/pdf')).toBe(true);
    expect(coincideMagicNumber(JPEG, 'image/jpeg')).toBe(true);
    expect(coincideMagicNumber(PNG, 'image/png')).toBe(true);
  });

  it('rechaza contenido que no coincide con el tipo declarado', () => {
    expect(coincideMagicNumber(TEXTO, 'application/pdf')).toBe(false);
    expect(coincideMagicNumber(PNG, 'application/pdf')).toBe(false);
  });

  it('rechaza un mimetype que no está en la whitelist', () => {
    expect(coincideMagicNumber(PDF, 'application/x-msdownload')).toBe(false);
  });

  it('rechaza un buffer más corto que la firma', () => {
    expect(coincideMagicNumber(Buffer.from([0x89, 0x50]), 'image/png')).toBe(false);
  });
});

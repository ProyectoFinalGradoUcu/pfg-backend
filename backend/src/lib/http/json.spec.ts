import { aJsonPlano, reemplazarBigInt } from './json';

describe('reemplazarBigInt', () => {
  it('pasa los BigInt a string y deja el resto igual', () => {
    expect(JSON.stringify({ id: 7n, n: 1, s: 'a' }, reemplazarBigInt)).toBe(
      '{"id":"7","n":1,"s":"a"}',
    );
  });
});

describe('aJsonPlano', () => {
  it('devuelve una copia serializable: BigInt como string y Date como ISO', () => {
    expect(
      aJsonPlano({ id: 7n, anidado: [{ tamanio: 184223n }], en: new Date('2026-10-01T00:00:00Z') }),
    ).toEqual({ id: '7', anidado: [{ tamanio: '184223' }], en: '2026-10-01T00:00:00.000Z' });
  });
});

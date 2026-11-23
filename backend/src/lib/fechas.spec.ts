import { anioUruguay, hoyUruguay } from './fechas';

describe('hoyUruguay', () => {
  it('a las 22 de Uruguay sigue siendo el mismo día', () => {
    expect(hoyUruguay(new Date('2026-11-23T01:00:00Z'))).toEqual(new Date('2026-11-22T00:00:00Z'));
  });

  it('a medianoche de Uruguay pasa al día siguiente', () => {
    expect(hoyUruguay(new Date('2026-11-23T03:00:00Z'))).toEqual(new Date('2026-11-23T00:00:00Z'));
  });

  it('el 31 de diciembre de noche sigue siendo el mismo año', () => {
    expect(anioUruguay(new Date('2027-01-01T02:00:00Z'))).toBe(2026);
  });
});

import { hoyComisiones, pertenenciaActiva, periodosSolapados, personaPuedeIntegrar } from './pertenencias';

describe('Vigencia de pertenencias', () => {
  const hoy = new Date('2026-11-05');
  it.each([
    [null, true], ['2026-12-31', true], ['2026-11-05', true], ['2026-11-04', false],
  ])('fin %s: activo %s (fin inclusivo)', (fin, esperado) => {
    expect(pertenenciaActiva({ fecha_inicio: new Date('2026-01-01'), fecha_fin: fin ? new Date(fin) : null }, hoy)).toBe(esperado);
  });
  it('no cuenta una pertenencia con inicio futuro', () => {
    expect(pertenenciaActiva({ fecha_inicio: new Date('2026-11-06'), fecha_fin: null }, hoy)).toBe(false);
  });
  it('una importada respeta los límites de su período laboral', () => {
    const a = { fecha_inicio: null, fecha_fin: null, relaciones_laborales: { fecha_inicio: new Date('2020-01-01'), fecha_fin: new Date('2025-12-31') } };
    expect(pertenenciaActiva(a, hoy)).toBe(false);
    expect(periodosSolapados(a, { fecha_inicio: new Date('2026-01-01'), fecha_fin: null })).toBe(false);
  });
  it('un retirado no puede estar activo, un reincorporado sí', () => {
    expect(personaPuedeIntegrar({ retiros: [{ anulado: false }], relaciones_laborales: [{ fecha_fin: hoy }] })).toBe(false);
    expect(personaPuedeIntegrar({ retiros: [{ anulado: false }], relaciones_laborales: [{ fecha_fin: null }] })).toBe(true);
  });
  it('usa el día de Uruguay cerca de medianoche UTC', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-06T01:00:00Z'));
    expect(hoyComisiones()).toEqual(hoy);
    jest.useRealTimers();
  });
});

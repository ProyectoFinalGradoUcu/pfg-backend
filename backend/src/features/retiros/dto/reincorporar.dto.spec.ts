import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReincorporarDto } from './reincorporar.dto';

// La API aceptaba orden y boletín vacíos o de solo espacios.
describe('ReincorporarDto · número de orden y boletín', () => {
  const base = { fecha_reincorporacion: '2026-10-01', grado_reincorporacion_id: 3, sub_unidad_id: 5 };

  const errores = async (extra: Record<string, unknown>) => {
    const dto = plainToInstance(ReincorporarDto, { ...base, ...extra });
    const res = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return { dto, campos: res.map((e) => e.property) };
  };

  it.each([
    ['los dos vacíos', { numero_orden: '', boletin: '   ' }],
    ['los dos de solo espacios', { numero_orden: '  ', boletin: '\t' }],
    ['ninguno', {}],
    ['los dos null', { numero_orden: null, boletin: null }],
  ])('rechaza %s, con un solo mensaje', async (_caso, extra) => {
    const dto = plainToInstance(ReincorporarDto, { ...base, ...extra });
    const res = await validate(dto);
    expect(res.map((e) => e.property)).toEqual(['numero_orden']);
    expect(Object.values(res[0].constraints!)).toEqual([
      'Indicá el número de orden o el boletín de la reincorporación',
    ]);
  });

  it('acepta solo el número de orden, recortado, y no guarda un boletín de espacios', async () => {
    const { dto, campos } = await errores({ numero_orden: '  O.D. 1  ', boletin: '   ' });
    expect(campos).toEqual([]);
    expect(dto.numero_orden).toBe('O.D. 1');
    expect(dto.boletin).toBeUndefined();
  });

  it('acepta solo el boletín', async () => {
    const { campos } = await errores({ boletin: 'B.P. 9012' });
    expect(campos).toEqual([]);
  });

  it('sigue validando el largo aunque el otro venga', async () => {
    const { campos } = await errores({ numero_orden: 'x'.repeat(51), boletin: 'B.P. 1' });
    expect(campos).toEqual(['numero_orden']);
  });

  it('rechaza un boletín que no es texto aunque venga el número de orden', async () => {
    const { campos } = await errores({ numero_orden: 'O.D. 1', boletin: 5 });
    expect(campos).toEqual(['boletin']);
  });
});

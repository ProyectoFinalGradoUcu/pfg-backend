import { variantesDePalabra, whereBusqueda } from './busqueda';

describe('whereBusqueda', () => {
  it('sin texto no filtra', () => {
    expect(whereBusqueda(undefined, ['cedula'])).toBeUndefined();
    expect(whereBusqueda('   ', ['cedula'])).toBeUndefined();
  });

  it('pide cada palabra en alguno de los campos', () => {
    const where = whereBusqueda('ana pérez', ['primer_nombre', 'primer_apellido'])!;
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where.AND[1])).toContain('"primer_apellido":{"contains":"perez"');
  });

  it('arma los campos anidados', () => {
    const where = whereBusqueda('ana', ['personas.primer_nombre'])!;
    expect(where.AND[0]).toEqual({
      OR: expect.arrayContaining([{ personas: { primer_nombre: { contains: 'ana', mode: 'insensitive' } } }]),
    });
  });
});

describe('variantesDePalabra', () => {
  it('sin tilde encuentra la palabra con tilde', () => {
    expect(variantesDePalabra('Suarez')).toEqual(expect.arrayContaining(['suarez', 'suárez']));
    expect(variantesDePalabra('munoz')).toContain('muñoz');
  });

  it('con tilde también busca sin tilde', () => {
    expect(variantesDePalabra('Díaz')).toEqual(expect.arrayContaining(['diaz', 'díaz']));
  });

  it('el % y el _ se buscan como texto', () => {
    expect(variantesDePalabra('%')).toEqual(['\\%']);
    expect(variantesDePalabra('a_b')).toContain('a\\_b');
  });
});

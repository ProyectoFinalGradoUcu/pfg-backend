import {
  fotoAsignacionMision,
  fotoConvocatoria,
  fotoDocumentoAsignacionMision,
  fotoDocumentoConvocatoria,
  fotoMision,
} from './misiones.auditoria';

const persona = (nombre: string, apellido: string, grado: string | null = 'Sargento') => ({
  id: 1n,
  primer_nombre: nombre,
  primer_apellido: apellido,
  relaciones_laborales: grado ? [{ grados: { denominacion: grado } }] : [],
});

const makePrisma = () =>
  ({
    misiones: { findUnique: jest.fn() },
    convocatorias: { findUnique: jest.fn() },
    funcionarios_convocatorias: { findFirst: jest.fn() },
  }) as any;

describe('fotos de misiones', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => (prisma = makePrisma()));

  it('misión con sus convocatorias', async () => {
    prisma.misiones.findUnique.mockResolvedValue({
      nombre_mision: 'Antártida 2026',
      pais: 'Antártida',
      numero_orden: 'O.D. 1',
      fecha_orden: new Date('2026-01-10T00:00:00Z'),
      boletin: null,
      fecha_boletin: null,
      resolucion_cje: null,
      convocatorias: [{ numero_orden: '12/2026', boletin: null }, { numero_orden: null, boletin: 'R. 4' }],
    });
    const foto = await fotoMision(5n, prisma);
    expect(foto).toEqual({
      nombre: 'Antártida 2026',
      campos: expect.objectContaining({ nombre_mision: 'Antártida 2026', pais: 'Antártida', convocatorias: ['12/2026', 'R. 4'] }),
    });
    expect(foto!.campos).not.toHaveProperty('id');
  });

  it('misión inexistente da null', async () => {
    prisma.misiones.findUnique.mockResolvedValue(null);
    expect(await fotoMision(5n, prisma)).toBeNull();
  });

  it('convocatoria con misión y funcionarios por nombre', async () => {
    prisma.convocatorias.findUnique.mockResolvedValue({
      numero_orden: '12/2026',
      boletin: null,
      fecha_salida: new Date('2026-03-01T00:00:00Z'),
      fecha_llegada: null,
      observaciones: 'x',
      misiones: { nombre_mision: 'Antártida 2026' },
      funcionarios: [{ personas: persona('Juan', 'Pérez') }],
    });
    expect(await fotoConvocatoria(3n, prisma)).toEqual({
      nombre: 'Antártida 2026 (orden 12/2026)',
      campos: {
        mision: 'Antártida 2026',
        numero_orden: '12/2026',
        boletin: null,
        fecha_salida: new Date('2026-03-01T00:00:00Z'),
        fecha_llegada: null,
        observaciones: 'x',
        funcionarios: ['Sargento Juan Pérez'],
      },
    });
  });

  it('convocatoria inexistente da null', async () => {
    prisma.convocatorias.findUnique.mockResolvedValue(null);
    expect(await fotoConvocatoria(3n, prisma)).toBeNull();
  });

  const asignacion = {
    numero_orden: null,
    boletin: 'R. 4',
    observaciones: null,
    personas: persona('Ana', 'Gómez', 'Cabo'),
    convocatorias: { numero_orden: '12/2026', misiones: { nombre_mision: 'Congo' } },
    archivo_orden: null,
    archivo_boletin: { nombre_original: 'res.pdf' },
  };

  it('asignación se busca por convocatoria y persona', async () => {
    prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(asignacion);
    const foto = await fotoAsignacionMision(7n, prisma, { convocatoriaId: '3', personaId: '7' });
    expect(prisma.funcionarios_convocatorias.findFirst.mock.calls[0][0].where).toEqual({ convocatoria_id: 3n, persona_id: 7n });
    expect(foto).toEqual({
      nombre: 'Cabo Ana Gómez en Congo (orden 12/2026)',
      campos: {
        persona: 'Cabo Ana Gómez',
        convocatoria: 'Congo (orden 12/2026)',
        numero_orden: null,
        boletin: 'R. 4',
        observaciones: null,
      },
    });
  });

  it('asignación inexistente da null', async () => {
    prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(null);
    expect(await fotoAsignacionMision(7n, prisma, { convocatoriaId: '3' })).toBeNull();
  });

  it('documento de asignación con el archivo del slot', async () => {
    prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(asignacion);
    expect(await fotoDocumentoAsignacionMision(9n, prisma, { id: '9', slot: 'boletin' })).toEqual({
      nombre: 'Cabo Ana Gómez en Congo (orden 12/2026)',
      campos: {
        persona: 'Cabo Ana Gómez',
        convocatoria: 'Congo (orden 12/2026)',
        documento: 'Resolución',
        archivo: 'res.pdf',
      },
    });
  });

  it('documento con el slot vacío da null', async () => {
    prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(asignacion);
    expect(await fotoDocumentoAsignacionMision(9n, prisma, { id: '9', slot: 'orden' })).toBeNull();
  });

  it('documento de convocatoria', async () => {
    prisma.convocatorias.findUnique.mockResolvedValue({
      numero_orden: null,
      misiones: { nombre_mision: 'Congo' },
      archivo_orden: { nombre_original: 'orden.pdf' },
      archivo_boletin: null,
    });
    expect(await fotoDocumentoConvocatoria(3n, prisma, { id: '3', slot: 'orden' })).toEqual({
      nombre: 'Congo',
      campos: { convocatoria: 'Congo', documento: 'Orden', archivo: 'orden.pdf' },
    });
  });

  it('documento de convocatoria inexistente da null', async () => {
    prisma.convocatorias.findUnique.mockResolvedValue(null);
    expect(await fotoDocumentoConvocatoria(3n, prisma, { slot: 'orden' })).toBeNull();
  });
});

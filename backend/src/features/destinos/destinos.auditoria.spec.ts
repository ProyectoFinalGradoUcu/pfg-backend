import { fotoDestino, fotoDocumentoDestino } from './destinos.auditoria';

const makePrisma = () => ({ destinos: { findUnique: jest.fn() } }) as any;

const destino = {
  fecha_inicio: new Date('2026-01-01T00:00:00Z'),
  fecha_fin: null,
  posicion_destino: 'Jefe de sección',
  numero_orden: '3/2026',
  fecha_orden: null,
  boletin: null,
  fecha_boletin: null,
  numero_destino: null,
  numero_resolucion: null,
  fecha_resolucion: null,
  observaciones: null,
  personas: {
    id: 1n,
    primer_nombre: 'Juan',
    primer_apellido: 'Pérez',
    relaciones_laborales: [{ grados: { denominacion: 'Sargento' } }],
  },
  sub_unidades: { denominacion: 'B.A.I.' },
  unidades: { denominacion: 'C.A.O.' },
  archivo_orden: null,
  archivo_boletin: { nombre_original: 'res.pdf' },
};

describe('fotos de destinos', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => (prisma = makePrisma()));

  it('destino con persona y lugar resueltos', async () => {
    prisma.destinos.findUnique.mockResolvedValue(destino);
    const foto = await fotoDestino(4n, prisma);
    expect(foto!.nombre).toBe('Sargento Juan Pérez en B.A.I.');
    expect(foto!.campos).toMatchObject({
      persona: 'Sargento Juan Pérez',
      sub_unidad: 'B.A.I.',
      comando: 'C.A.O.',
      posicion_destino: 'Jefe de sección',
      numero_orden: '3/2026',
    });
    for (const clave of ['personas', 'sub_unidades', 'unidades', 'archivo_orden', 'archivo_boletin']) {
      expect(foto!.campos).not.toHaveProperty(clave);
    }
  });

  it('destino inexistente da null', async () => {
    prisma.destinos.findUnique.mockResolvedValue(null);
    expect(await fotoDestino(4n, prisma)).toBeNull();
  });

  it('documento de destino', async () => {
    prisma.destinos.findUnique.mockResolvedValue(destino);
    expect(await fotoDocumentoDestino(4n, prisma, { id: '4', slot: 'boletin' })).toEqual({
      nombre: 'Sargento Juan Pérez en B.A.I.',
      campos: { destino: 'Sargento Juan Pérez en B.A.I.', documento: 'Resolución', archivo: 'res.pdf' },
    });
  });

  it('documento con el slot vacío da null', async () => {
    prisma.destinos.findUnique.mockResolvedValue(destino);
    expect(await fotoDocumentoDestino(4n, prisma, { id: '4', slot: 'orden' })).toBeNull();
  });
});

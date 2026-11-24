import { Prisma } from '@prisma/client';
import { fotoPeriodoVuelo, fotoRegistroVuelo, fotoUnidadVuelo } from './vuelos.auditoria';
import { calcularCambios } from '../auditoria/auditoria-cambios';
import type { PrismaService } from '../../lib/prisma.service';

const makePrisma = () => ({
  unidades_vuelo: { findUnique: jest.fn() },
  periodos_vuelo: { findUnique: jest.fn() },
  registros_vuelo: { findUnique: jest.fn() },
});

const makeRegistro = (over: Record<string, unknown> = {}) => ({
  aeronaves: 'UH-1H',
  hs_av_anio_militar: new Prisma.Decimal(4.8),
  hs_av_total: new Prisma.Decimal(2671.4),
  hs_ob_anio_militar: new Prisma.Decimal(0),
  hs_ob_total: new Prisma.Decimal(0),
  personas: {
    id: 3n,
    primer_nombre: 'Juan',
    primer_apellido: 'Pérez',
    relaciones_laborales: [{ grados: { denominacion: 'Sgto.' } }],
  },
  periodos_vuelo: { anio: 2026, numero: 1 },
  unidades_vuelo: { denominacion: 'Esc. Aér. 5' },
  ...over,
});

describe('VuelosAuditoria', () => {
  let prisma: ReturnType<typeof makePrisma>;
  const db = () => prisma as unknown as PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it('foto de la unidad de vuelo', async () => {
    prisma.unidades_vuelo.findUnique.mockResolvedValue({ denominacion: 'Esc. Aér. 5', vigente: true });

    expect(await fotoUnidadVuelo(1n, db())).toEqual({
      nombre: 'Esc. Aér. 5',
      campos: { denominacion: 'Esc. Aér. 5', vigente: true },
    });
  });

  it('foto del período con su etiqueta y cantidad de registros', async () => {
    prisma.periodos_vuelo.findUnique.mockResolvedValue({
      anio: 2026,
      numero: 2,
      cerrado: true,
      _count: { registros_vuelo: 120 },
    });

    const foto = await fotoPeriodoVuelo(4n, db());

    expect(foto?.nombre).toMatch(/Período 2026$/);
    expect(foto?.campos).toEqual({ periodo: foto?.nombre, cerrado: true, registros: 120 });
  });

  it('foto del registro con persona, período y unidad en texto', async () => {
    prisma.registros_vuelo.findUnique.mockResolvedValue(makeRegistro());

    const foto = await fotoRegistroVuelo(9n, db());

    expect(foto?.nombre).toMatch(/^Sgto\. Juan Pérez \(.*Período 2026\)$/);
    expect(foto?.campos).toEqual(
      expect.objectContaining({
        persona: 'Sgto. Juan Pérez',
        unidad_vuelo: 'Esc. Aér. 5',
        aeronaves: 'UH-1H',
      }),
    );
    expect(Object.keys(foto!.campos).some((c) => c.endsWith('_id'))).toBe(false);
  });

  it('el diff del registro muestra horas como número y la unidad en texto', async () => {
    prisma.registros_vuelo.findUnique
      .mockResolvedValueOnce(makeRegistro())
      .mockResolvedValueOnce(makeRegistro({ hs_av_total: new Prisma.Decimal(2675.2), unidades_vuelo: null }));

    const antes = await fotoRegistroVuelo(9n, db());
    const despues = await fotoRegistroVuelo(9n, db());

    expect(calcularCambios(antes!.campos, despues!.campos)).toEqual([
      { campo: 'unidad_vuelo', anterior: 'Esc. Aér. 5', nuevo: null },
      { campo: 'hs_av_total', anterior: 2671.4, nuevo: 2675.2 },
    ]);
  });

  it('las fotos de vuelos que no existen son null', async () => {
    prisma.unidades_vuelo.findUnique.mockResolvedValue(null);
    prisma.periodos_vuelo.findUnique.mockResolvedValue(null);
    prisma.registros_vuelo.findUnique.mockResolvedValue(null);

    expect(await fotoUnidadVuelo(1n, db())).toBeNull();
    expect(await fotoPeriodoVuelo(1n, db())).toBeNull();
    expect(await fotoRegistroVuelo(1n, db())).toBeNull();
  });
});

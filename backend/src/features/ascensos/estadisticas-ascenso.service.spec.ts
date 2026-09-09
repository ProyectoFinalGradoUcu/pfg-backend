import { Test, TestingModule } from '@nestjs/testing';
import { EstadisticasAscensoService } from './estadisticas-ascenso.service';
import { PrismaService } from '../../lib/prisma.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const grado = (codigo: string, denominacion: string, orden: number, id = 1n) => ({
  id,
  codigo,
  denominacion,
  orden,
});

const makePrismaMock = () => ({
  ascensos: { count: jest.fn().mockResolvedValue(0) },
  relaciones_laborales: { groupBy: jest.fn().mockResolvedValue([]) },
  grados: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('EstadisticasAscensoService', () => {
  let service: EstadisticasAscensoService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EstadisticasAscensoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<EstadisticasAscensoService>(EstadisticasAscensoService);
  });

  describe('período', () => {
    it('sin filtro toma los últimos diez años', async () => {
      await service.estadisticas();

      const actual = new Date().getUTCFullYear();
      const where = prisma.ascensos.count.mock.calls[0][0].where;
      expect(where.fecha_ascenso.gte).toEqual(new Date(Date.UTC(actual - 9, 0, 1)));
      expect(where.fecha_ascenso.lt).toEqual(new Date(Date.UTC(actual + 1, 0, 1)));
    });

    it('respeta el período pedido', async () => {
      await service.estadisticas({ anio_desde: 2020, anio_hasta: 2022 });

      const where = prisma.ascensos.count.mock.calls[0][0].where;
      expect(where.fecha_ascenso.gte).toEqual(new Date(Date.UTC(2020, 0, 1)));
      expect(where.fecha_ascenso.lt).toEqual(new Date(Date.UTC(2023, 0, 1)));
    });

    it('con alcance de unidad filtra por la relación laboral nueva', async () => {
      await service.estadisticas({}, { tipo: 'unidad', unidadIds: ['5'] });

      const where = prisma.ascensos.count.mock.calls[0][0].where;
      expect(where.relacion_laboral_nueva.unidad_id).toEqual({ in: [5n] });
    });
  });

  describe('totales', () => {
    it('los anulados no cuentan como ascensos del período', async () => {
      prisma.ascensos.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const res = await service.estadisticas();

      expect(res.totales.ascensos).toBe(1);
      expect(res.totales.anulados).toBe(1);
      // Los vigentes y los anulados se cuentan por separado, no sobre el mismo where.
      expect(prisma.ascensos.count.mock.calls[0][0].where.anulado_en).toBeNull();
      expect(prisma.ascensos.count.mock.calls[1][0].where.anulado_en).toEqual({ not: null });
    });
  });

  describe('pirámide', () => {
    it('muestra la dotación por grado en el orden de la escala', async () => {
      prisma.grados.findMany.mockResolvedValue([
        grado('CBO_1RA', 'Cbo. 1ª', 3, 4n),
        grado('CBO_2DA', 'Cbo. 2ª', 2, 3n),
        grado('CADETE_1RA', 'Cadete 1ª', 0, 90n),
      ]);
      prisma.relaciones_laborales.groupBy.mockResolvedValue([
        { grado_id: 3n, _count: { _all: 12 } },
      ]);

      const res = await service.estadisticas();

      expect(res.piramide.map((p) => p.codigo)).toEqual(['CBO_2DA', 'CBO_1RA']);
      expect(res.piramide[0].dotacion).toBe(12);
      expect(res.piramide[1].dotacion).toBe(0);
    });
  });
});

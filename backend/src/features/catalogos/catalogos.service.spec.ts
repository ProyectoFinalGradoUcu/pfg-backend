import { Test, TestingModule } from '@nestjs/testing';
import { CatalogosService } from './catalogos.service';
import { PrismaService } from '../../lib/prisma.service';

const makePrismaMock = () => ({
  unidades: {
    findMany: jest.fn(),
  },
  sub_unidades: {
    findMany: jest.fn(),
  },
  motivos_baja: {
    findMany: jest.fn(),
  },
  escalafones: {
    findUnique: jest.fn(),
  },
  grados: {
    findMany: jest.fn(),
  },
});

describe('CatalogosService · grados por escalafón', () => {
  let service: CatalogosService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module = await Test.createTestingModule({
      providers: [CatalogosService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CatalogosService);
  });

  it.each([
    ['SG', { es_subalterno: true }],
    ['ST', { es_subalterno: true }],
    ['AV', { es_oficial: true }],
  ])('usa la escala correspondiente cuando %s no tiene grados vinculados', async (codigo, fallback) => {
    prisma.escalafones.findUnique.mockResolvedValue({ codigo });
    prisma.grados.findMany.mockResolvedValue([]);

    await service.findGrados(13);

    expect(prisma.grados.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        vigente: true,
        OR: [{ escalafon_id: 13n }, fallback],
      },
    }));
  });

  it('usa la escala propia de aerotécnicos para AT', async () => {
    prisma.escalafones.findUnique.mockResolvedValue({ codigo: 'AT' });
    prisma.grados.findMany.mockResolvedValue([]);

    await service.findGrados(14);

    expect(prisma.grados.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        vigente: true,
        OR: [
          { escalafon_id: 14n },
          { codigo: { in: ['AT_2DA', 'AT_1RA', 'AT_PPAL', 'INST_AT', 'SUP_AT'] } },
        ],
      },
    }));
  });

  it('devuelve el escalafón como null cuando el catálogo compartido no lo informa', async () => {
    prisma.escalafones.findUnique.mockResolvedValue({ codigo: 'AV' });
    prisma.grados.findMany.mockResolvedValue([
      { id: 7n, codigo: 'ALF', denominacion: 'Alf.', escalafon_id: null, orden: 7 },
    ]);

    await expect(service.findGrados(1)).resolves.toEqual([
      { id: 7, codigo: 'ALF', denominacion: 'Alf.', escalafon_id: null, orden: 7 },
    ]);
  });

  it('devuelve vacío si el escalafón no existe', async () => {
    prisma.escalafones.findUnique.mockResolvedValue(null);

    await expect(service.findGrados(999)).resolves.toEqual([]);
    expect(prisma.grados.findMany).not.toHaveBeenCalled();
  });
});

describe('CatalogosService · catálogos de liquidación', () => {
  let service: CatalogosService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeAll(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CatalogosService>(CatalogosService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── findSubUnidades ────────────────────────────────────────────────────────
  // El destino es la sub-unidad; el comando (unidad_id) va para agrupar en los selectores.

  describe('findSubUnidades', () => {
    it('devuelve las vigentes con su comando, ordenadas por comando', async () => {
      prisma.sub_unidades.findMany.mockResolvedValue([
        { id: 1n, codigo: 'BAI', denominacion: 'B.A.I.', unidad_id: 1n, unidades: { codigo: 'CAO', denominacion: 'C.A.O.' } },
        { id: 8n, codigo: 'EMA', denominacion: 'E.M.A.', unidad_id: 2n, unidades: { codigo: 'CAP', denominacion: 'C.A.P.' } },
      ]);

      const result = await service.findSubUnidades();

      expect(prisma.sub_unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vigente: true },
          orderBy: [{ unidades: { denominacion: 'asc' } }, { denominacion: 'asc' }],
        }),
      );
      expect(result).toEqual([
        {
          id: 1, codigo: 'BAI', denominacion: 'B.A.I.', unidad_id: 1,
          comando: { id: 1, codigo: 'CAO', denominacion: 'C.A.O.' },
        },
        {
          id: 8, codigo: 'EMA', denominacion: 'E.M.A.', unidad_id: 2,
          comando: { id: 2, codigo: 'CAP', denominacion: 'C.A.P.' },
        },
      ]);
    });
  });

  // ─── findMotivosBaja ────────────────────────────────────────────────────────
  // Alimenta el desplegable de motivo_baja_id al registrar un retiro.

  describe('findMotivosBaja', () => {
    it('devuelve solo los vigentes, ordenados por denominacion', async () => {
      prisma.motivos_baja.findMany.mockResolvedValue([
        { id: 4n, codigo: 'BAJA_DEFINITIVA', denominacion: 'Baja definitiva.' },
        { id: 5n, codigo: 'RETIRO_OBL', denominacion: 'Baja por retiro obligatorio.' },
      ]);

      const result = await service.findMotivosBaja();

      expect(prisma.motivos_baja.findMany).toHaveBeenCalledWith({
        where: { vigente: true },
        orderBy: { denominacion: 'asc' },
        select: { id: true, codigo: true, denominacion: true },
      });
      expect(result).toEqual([
        { id: 4, codigo: 'BAJA_DEFINITIVA', denominacion: 'Baja definitiva.' },
        { id: 5, codigo: 'RETIRO_OBL', denominacion: 'Baja por retiro obligatorio.' },
      ]);
    });

    it('convierte el BigInt del id a number', async () => {
      prisma.motivos_baja.findMany.mockResolvedValue([
        { id: 9007199254740991n, codigo: 'X', denominacion: 'X' },
      ]);

      const result = await service.findMotivosBaja();

      expect(typeof result[0].id).toBe('number');
    });

    it('devuelve lista vacia si no hay motivos vigentes', async () => {
      prisma.motivos_baja.findMany.mockResolvedValue([]);

      expect(await service.findMotivosBaja()).toEqual([]);
    });
  });
});

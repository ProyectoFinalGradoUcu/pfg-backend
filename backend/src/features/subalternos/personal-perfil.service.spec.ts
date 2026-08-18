import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PersonalPerfilService } from './personal-perfil.service';
import { PrismaService } from '../../lib/prisma.service';

const makeAsignacion = (overrides: Partial<any> = {}) => ({
  id: 200n,
  persona_id: 100n,
  unidad_id: 5n,
  fecha_inicio: new Date('2024-04-30'),
  fecha_fin: null,
  posicion_destino: 'Sub-Jefe de Personal A-1',
  numero_orden: 'O.D. 11007',
  boletin: null,
  observaciones: null,
  unidades: {
    id: 5n,
    codigo: 'CG',
    denominacion: 'Cuartel General',
    tipo: 'Unidad',
  },
  ...overrides,
});

const makePrismaMock = () => ({
  personas: { findUnique: jest.fn() },
  destinos: { findMany: jest.fn() },
});

describe('PersonalPerfilService', () => {
  let service: PersonalPerfilService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeAll(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PersonalPerfilService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PersonalPerfilService>(PersonalPerfilService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('findDestinos', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({ id: 100n });
      prisma.destinos.findMany.mockResolvedValue([]);
    });

    it('rechaza si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.findDestinos(999)).rejects.toThrow(NotFoundException);
    });

    it('devuelve el historial de destinos del funcionario', async () => {
      prisma.destinos.findMany.mockResolvedValue([makeAsignacion()]);

      const result = await service.findDestinos(100);

      expect(result).toEqual([
        {
          id: '200',
          unidad_id: '5',
          unidad: 'Cuartel General',
          codigo_unidad: 'CG',
          tipo_unidad: 'Unidad',
          posicion_destino: 'Sub-Jefe de Personal A-1',
          fecha_inicio: '2024-04-30',
          fecha_fin: null,
          numero_orden: 'O.D. 11007',
          boletin: null,
          observaciones: null,
          activo: true,
        },
      ]);
    });

    it('marca como no activo el destino ya cerrado', async () => {
      prisma.destinos.findMany.mockResolvedValue([
        makeAsignacion({ fecha_fin: new Date('2026-08-31') }),
      ]);

      const result = await service.findDestinos(100);

      expect(result[0].activo).toBe(false);
      expect(result[0].fecha_fin).toBe('2026-08-31');
    });

    it('ordena del destino más reciente al más antiguo', async () => {
      await service.findDestinos(100);

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { persona_id: 100n },
          orderBy: { fecha_inicio: 'desc' },
        }),
      );
    });
  });
});

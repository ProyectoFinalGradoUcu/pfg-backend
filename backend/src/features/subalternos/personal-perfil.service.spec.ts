import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

const makePersonaFamiliar = (overrides: Partial<any> = {}) => ({
  id: 16n,
  cedula: '60000016',
  primer_nombre: 'Laura',
  segundo_nombre: 'Cecilia',
  primer_apellido: 'Acosta',
  segundo_apellido: 'Ferreira',
  genero: 'F',
  relaciones_laborales: [],
  ...overrides,
});

const makeRelacion = (overrides: Partial<any> = {}) => ({
  persona_id: 31n,
  tipo_relacion: 'Madre',
  personas_relaciones_familiares_persona_idTopersonas: makePersonaFamiliar({
    id: 31n, cedula: '12345678', primer_nombre: 'Sofía', segundo_nombre: null,
    primer_apellido: 'Guerrico', segundo_apellido: null, genero: 'F',
  }),
  personas_relaciones_familiares_familiar_idTopersonas: makePersonaFamiliar(),
  ...overrides,
});

const makePrismaMock = () => ({
  personas: { findUnique: jest.fn() },
  destinos: { findMany: jest.fn() },
  relaciones_familiares: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
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

  describe('findFamiliares', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({ id: 31n });
      prisma.relaciones_familiares.findMany.mockResolvedValue([]);
    });

    it('rechaza si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.findFamiliares(999)).rejects.toThrow(NotFoundException);
    });

    it('consulta relaciones en ambos sentidos (persona_id o familiar_id)', async () => {
      await service.findFamiliares(31);

      expect(prisma.relaciones_familiares.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ persona_id: 31n }, { familiar_id: 31n }] },
        }),
      );
    });

    it('devuelve el familiar tal cual cuando la persona consultada dio de alta el vínculo', async () => {
      prisma.relaciones_familiares.findMany.mockResolvedValue([makeRelacion()]);

      const result = await service.findFamiliares(31);

      expect(result).toEqual([
        {
          id: 16,
          cedula: '60000016',
          nombre_completo: 'Laura Cecilia Acosta Ferreira',
          tipo_relacion: 'Madre',
          grado: null,
          unidad: null,
        },
      ]);
    });

    it('invierte el vínculo cuando la persona consultada es la familiar del registro', async () => {
      prisma.relaciones_familiares.findMany.mockResolvedValue([makeRelacion()]);

      const result = await service.findFamiliares(16);

      expect(result).toEqual([
        expect.objectContaining({ id: 31, cedula: '12345678', tipo_relacion: 'Hijo/a' }),
      ]);
    });

    it('invierte "Hijo/a" según el género de la persona consultada', async () => {
      prisma.relaciones_familiares.findMany.mockResolvedValue([
        makeRelacion({
          tipo_relacion: 'Hijo/a',
          personas_relaciones_familiares_familiar_idTopersonas: makePersonaFamiliar({ genero: 'M' }),
        }),
      ]);

      const result = await service.findFamiliares(16);

      expect(result[0].tipo_relacion).toBe('Padre');
    });

    it('mantiene vínculos simétricos como Cónyuge y Hermano/a en ambos sentidos', async () => {
      prisma.relaciones_familiares.findMany.mockResolvedValue([
        makeRelacion({ tipo_relacion: 'Cónyuge' }),
      ]);

      const result = await service.findFamiliares(16);

      expect(result[0].tipo_relacion).toBe('Cónyuge');
    });
  });

  describe('findFamiliaresPorCedula', () => {
    it('rechaza si no existe ninguna persona con esa cédula', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.findFamiliaresPorCedula('00000000')).rejects.toThrow(NotFoundException);
    });

    it('resuelve la cédula al id interno y devuelve sus familiares', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 31n });
      prisma.relaciones_familiares.findMany.mockResolvedValue([makeRelacion()]);

      const result = await service.findFamiliaresPorCedula('12345678');

      expect(prisma.personas.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { cedula: '12345678' } }),
      );
      expect(result).toEqual([
        expect.objectContaining({ id: 16, cedula: '60000016', tipo_relacion: 'Madre' }),
      ]);
    });
  });

  describe('addFamiliar', () => {
    const mockAncla = (familiar: any) => {
      prisma.personas.findUnique.mockImplementation(({ where }: any) =>
        where.id !== undefined
          ? Promise.resolve({ id: 31n })
          : Promise.resolve(familiar),
      );
    };

    beforeEach(() => {
      prisma.relaciones_familiares.findFirst.mockResolvedValue(null);
      prisma.relaciones_familiares.create.mockResolvedValue({});
    });

    it('rechaza si la persona anfitriona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.addFamiliar(999, { cedula: '60000016' })).rejects.toThrow(NotFoundException);
    });

    it('rechaza si no existe ningún registrado con esa cédula', async () => {
      mockAncla(null);

      await expect(service.addFamiliar(31, { cedula: '00000000' })).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el familiar es civil', async () => {
      mockAncla({ id: 16n, cedula: '60000016', primer_nombre: 'Laura', primer_apellido: 'Acosta', es_civil: true });

      await expect(service.addFamiliar(31, { cedula: '60000016' })).rejects.toThrow(BadRequestException);
    });

    it('rechaza vincularse a sí mismo', async () => {
      mockAncla({ id: 31n, cedula: '12345678', primer_nombre: 'Sofía', primer_apellido: 'Guerrico', es_civil: false });

      await expect(service.addFamiliar(31, { cedula: '12345678' })).rejects.toThrow(BadRequestException);
    });

    it('rechaza un vínculo ya existente, sin importar la dirección en que se guardó', async () => {
      mockAncla({ id: 16n, cedula: '60000016', primer_nombre: 'Laura', primer_apellido: 'Acosta', es_civil: false });
      prisma.relaciones_familiares.findFirst.mockResolvedValue({ persona_id: 16n, familiar_id: 31n });

      await expect(service.addFamiliar(31, { cedula: '60000016' })).rejects.toThrow(ConflictException);
      expect(prisma.relaciones_familiares.create).not.toHaveBeenCalled();
    });

    it('crea el vínculo y devuelve el familiar agregado', async () => {
      mockAncla({ id: 16n, cedula: '60000016', primer_nombre: 'Laura', primer_apellido: 'Acosta', es_civil: false });

      const result = await service.addFamiliar(31, { cedula: '60000016', tipo_relacion: 'Madre' });

      expect(prisma.relaciones_familiares.create).toHaveBeenCalledWith({
        data: { persona_id: 31n, familiar_id: 16n, tipo_relacion: 'Madre' },
      });
      expect(result).toEqual({
        id: 16, cedula: '60000016', nombre_completo: 'Laura Acosta', tipo_relacion: 'Madre', grado: null, unidad: null,
      });
    });
  });

  describe('removeFamiliar', () => {
    it('rechaza si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.removeFamiliar(999, 16)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si no existe ese vínculo', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 31n });
      prisma.relaciones_familiares.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeFamiliar(31, 16)).rejects.toThrow(NotFoundException);
    });

    it('elimina el vínculo sin importar en qué dirección quedó guardado', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 31n });
      prisma.relaciones_familiares.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeFamiliar(31, 16);

      expect(prisma.relaciones_familiares.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ persona_id: 31n, familiar_id: 16n }, { persona_id: 16n, familiar_id: 31n }] },
      });
    });
  });
});

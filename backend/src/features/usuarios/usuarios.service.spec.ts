import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeUsuario = (overrides: Partial<any> = {}) => ({
  id: 1n,
  username: 'test@fau.mil.uy',
  password_hash: '$2b$12$hash',
  estado: 'activo',
  aplicacion: 'pfg',
  persona_id: null,
  intentos_fallidos: 0,
  bloqueado_hasta: null,
  fecha_actualizacion: new Date(),
  sesiones_invalidas_desde: null,
  ...overrides,
});

const makeUsuarioConRelaciones = (overrides: Partial<any> = {}) => ({
  ...makeUsuario(overrides),
  usuarios_roles: [],
  usuarios_unidades: [],
  personas: null,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  usuarios: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  personas: {
    findUnique: jest.fn(),
  },
  roles: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  usuarios_roles: {
    createMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  unidades: {
    findMany: jest.fn(),
  },
  usuarios_unidades: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

const makeSesionesMock = () => ({
  invalidarUsuario: jest.fn().mockResolvedValue(undefined),
  invalidarPorUnidad: jest.fn().mockResolvedValue(undefined),
  contarUsuariosDeUnidad: jest.fn().mockResolvedValue(0),
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('UsuariosService', () => {
  let service: UsuariosService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let sesiones: ReturnType<typeof makeSesionesMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    sesiones = makeSesionesMock();
    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: prisma },
        { provide: SesionesService, useValue: sesiones },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
  });

  // ─── remove (deshabilitar usuario) ──────────────────────────────────────────

  describe('remove', () => {
    it('cambia el estado a bloqueado (borrado lógico)', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(makeUsuario());

      const result = await service.remove('1', '99');

      expect(prisma.usuarios.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { estado: 'bloqueado', bloqueado_hasta: null, intentos_fallidos: 0 },
      });
      expect(result).toEqual({ ok: true });
    });

    it('lanza ForbiddenException si intenta deshabilitar su propio usuario', async () => {
      await expect(service.remove('1', '1')).rejects.toThrow(ForbiddenException);
      expect(prisma.usuarios.findFirst).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(null);

      await expect(service.remove('99', '1')).rejects.toThrow(NotFoundException);
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });
  });

  // ─── update (reactivar usuario) ─────────────────────────────────────────────

  describe('update', () => {
    it('reactiva un usuario bloqueado (estado activo limpia bloqueo)', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({ estado: 'bloqueado' }),
      );
      // findOne interno
      prisma.usuarios.findFirst
        .mockResolvedValueOnce(makeUsuario({ estado: 'bloqueado' }))
        .mockResolvedValueOnce(makeUsuarioConRelaciones({ estado: 'activo' }));

      await service.update('1', { estado: 'activo' }, '99');

      expect(prisma.usuarios.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1n },
          data: expect.objectContaining({
            estado: 'activo',
            bloqueado_hasta: null,
            intentos_fallidos: 0,
          }),
        }),
      );
    });

    it('lanza ForbiddenException si intenta bloquearse a sí mismo', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(makeUsuario());

      await expect(
        service.update('1', { estado: 'bloqueado' }, '1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(null);

      await expect(
        service.update('99', { estado: 'activo' }, '1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

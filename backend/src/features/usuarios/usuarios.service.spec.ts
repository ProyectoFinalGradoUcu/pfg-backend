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

  describe('findAll', () => {
    const argsDelListado = () => prisma.usuarios.findMany.mock.calls[0][0];

    beforeEach(() => {
      prisma.usuarios.count.mockResolvedValue(0);
      prisma.usuarios.findMany.mockResolvedValue([]);
    });

    it('sin filtros lista todos los usuarios de la aplicación', async () => {
      await service.findAll({ page: 1, pageSize: 10 });

      expect(Object.keys(argsDelListado().where)).toEqual(['aplicacion']);
    });

    const condicionDe = (palabra: string) => ({
      OR: [
        { username: { contains: palabra, mode: 'insensitive' } },
        { personas: { primer_nombre: { contains: palabra, mode: 'insensitive' } } },
        { personas: { primer_apellido: { contains: palabra, mode: 'insensitive' } } },
      ],
    });

    it('busca en el email, el nombre y el apellido, sin distinguir mayúsculas ni espacios sobrantes', async () => {
      await service.findAll({ search: '  JEFE ' });

      expect(argsDelListado().where.AND).toEqual([condicionDe('JEFE')]);
    });

    it('con varias palabras exige todas, en cualquier columna', async () => {
      await service.findAll({ search: 'Victoria   Castro' });

      expect(argsDelListado().where.AND).toEqual([condicionDe('Victoria'), condicionDe('Castro')]);
    });

    it('una búsqueda solo de espacios no filtra', async () => {
      await service.findAll({ search: '   ' });

      expect(argsDelListado().where).not.toHaveProperty('AND');
    });

    it('combina búsqueda, rol y estado, y el total respeta los mismos filtros', async () => {
      await service.findAll({ search: 'jefe', rolId: 2, estado: 'bloqueado' });

      const where = argsDelListado().where;
      expect(where).toEqual(
        expect.objectContaining({
          AND: [condicionDe('jefe')],
          usuarios_roles: { some: { rol_id: 2n } },
          estado: 'bloqueado',
        }),
      );
      expect(prisma.usuarios.count).toHaveBeenCalledWith({ where });
    });
  });

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

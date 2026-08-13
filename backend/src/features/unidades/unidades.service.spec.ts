import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UnidadesService } from './unidades.service';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeUnidad = (overrides: Partial<any> = {}) => ({
  id: 1n,
  codigo: 'CG',
  denominacion: 'Cuartel General',
  vigente: true,
  _count: { unidades_roles: 1 },
  ...overrides,
});

const makeRol = (overrides: Partial<any> = {}) => ({
  id: 3n,
  nombre: 'Control de cursos',
  descripcion: 'Administra la formación de la unidad',
  roles_permisos: [{ permisos: { id: 9n, nombre: 'cursos.gestionar.unidad' } }],
  ...overrides,
});

const makeUnidadConRoles = (overrides: Partial<any> = {}) => ({
  id: 1n,
  codigo: 'CG',
  denominacion: 'Cuartel General',
  vigente: true,
  unidades_roles: [{ roles: makeRol() }],
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  unidades: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  relaciones_laborales: {
    count: jest.fn().mockResolvedValue(0),
  },
  usuarios: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  roles: {
    findFirst: jest.fn(),
  },
  unidades_roles: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
});

const makeSesionesMock = () => ({
  invalidarPorUnidad: jest.fn().mockResolvedValue(undefined),
  invalidarUsuario: jest.fn().mockResolvedValue(undefined),
  contarUsuariosDeUnidad: jest.fn().mockResolvedValue(14),
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('UnidadesService', () => {
  let service: UnidadesService;
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
        UnidadesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SesionesService, useValue: sesiones },
      ],
    }).compile();

    service = module.get<UnidadesService>(UnidadesService);
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('devuelve las unidades con su cantidad de roles y de usuarios', async () => {
      prisma.unidades.count.mockResolvedValue(1);
      prisma.unidades.findMany.mockResolvedValue([makeUnidad()]);

      const result = await service.findAll({});

      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('1');
      expect(result.items[0].cantidadRoles).toBe(1);
      expect(result.items[0].cantidadUsuarios).toBe(14);
    });

    it('busca por código y denominación cuando llega el parámetro search', async () => {
      prisma.unidades.count.mockResolvedValue(0);
      prisma.unidades.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'Cuartel' });

      expect(prisma.unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { codigo: { contains: 'Cuartel', mode: 'insensitive' } },
              { denominacion: { contains: 'Cuartel', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('limita el pageSize a 100 aunque pidan más', async () => {
      prisma.unidades.count.mockResolvedValue(0);
      prisma.unidades.findMany.mockResolvedValue([]);

      const result = await service.findAll({ pageSize: 500 });

      expect(result.pageSize).toBe(100);
      expect(prisma.unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('devuelve la unidad con sus roles y los permisos que aportan', async () => {
      prisma.unidades.findUnique.mockResolvedValue(makeUnidadConRoles());

      const result = await service.findOne('1');

      expect(result.id).toBe('1');
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].nombre).toBe('Control de cursos');
      expect(result.roles[0].permisos[0].nombre).toBe('cursos.gestionar.unidad');
    });

    it('devuelve la lista de roles vacía si la unidad no tiene ninguno asignado', async () => {
      prisma.unidades.findUnique.mockResolvedValue(
        makeUnidadConRoles({ unidades_roles: [] }),
      );

      const result = await service.findOne('1');

      expect(result.roles).toEqual([]);
    });

    it('lanza NotFoundException si la unidad no existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue(null);

      await expect(service.findOne('99')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── asignarRol ─────────────────────────────────────────────────────────────

  describe('asignarRol', () => {
    it('asigna el rol e invalida las sesiones de todos los usuarios de la unidad', async () => {
      prisma.unidades.findUnique
        .mockResolvedValueOnce({ id: 1n })
        .mockResolvedValueOnce(makeUnidadConRoles());
      prisma.roles.findFirst.mockResolvedValue({ id: 3n });
      prisma.unidades_roles.findUnique.mockResolvedValue(null);
      prisma.unidades_roles.create.mockResolvedValue({});

      await service.asignarRol('1', '3');

      expect(prisma.unidades_roles.create).toHaveBeenCalledWith({
        data: { unidad_id: 1n, rol_id: 3n },
      });
      expect(sesiones.invalidarPorUnidad).toHaveBeenCalledWith(1n);
    });

    it('lanza NotFoundException si la unidad no existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue(null);

      await expect(service.asignarRol('99', '3')).rejects.toThrow(
        NotFoundException,
      );
      expect(sesiones.invalidarPorUnidad).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el rol no existe o es de otra aplicación', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 1n });
      prisma.roles.findFirst.mockResolvedValue(null);

      await expect(service.asignarRol('1', '99')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ConflictException si el rol ya estaba asignado a esa unidad', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 1n });
      prisma.roles.findFirst.mockResolvedValue({ id: 3n });
      prisma.unidades_roles.findUnique.mockResolvedValue({
        unidad_id: 1n,
        rol_id: 3n,
      });

      await expect(service.asignarRol('1', '3')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.unidades_roles.create).not.toHaveBeenCalled();
      expect(sesiones.invalidarPorUnidad).not.toHaveBeenCalled();
    });
  });

  // ─── quitarRol ──────────────────────────────────────────────────────────────

  describe('quitarRol', () => {
    it('quita el rol e invalida las sesiones de la unidad', async () => {
      prisma.unidades.findUnique
        .mockResolvedValueOnce({ id: 1n })
        .mockResolvedValueOnce(makeUnidadConRoles({ unidades_roles: [] }));
      prisma.unidades_roles.findUnique.mockResolvedValue({
        unidad_id: 1n,
        rol_id: 3n,
      });
      prisma.unidades_roles.delete.mockResolvedValue({});

      await service.quitarRol('1', '3');

      expect(prisma.unidades_roles.delete).toHaveBeenCalledWith({
        where: { unidad_id_rol_id: { unidad_id: 1n, rol_id: 3n } },
      });
      expect(sesiones.invalidarPorUnidad).toHaveBeenCalledWith(1n);
    });

    it('lanza NotFoundException si el rol no estaba asignado a esa unidad', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 1n });
      prisma.unidades_roles.findUnique.mockResolvedValue(null);

      await expect(service.quitarRol('1', '3')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.unidades_roles.delete).not.toHaveBeenCalled();
      expect(sesiones.invalidarPorUnidad).not.toHaveBeenCalled();
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('normaliza el código a mayúsculas y recorta espacios', async () => {
      prisma.unidades.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeUnidadConRoles());
      prisma.unidades.create.mockResolvedValue({ id: 1n });

      await service.create({ codigo: ' ef ', denominacion: '  Escuela  ' });

      expect(prisma.unidades.create).toHaveBeenCalledWith({
        data: { codigo: 'EF', denominacion: 'Escuela', vigente: true },
      });
    });

    it('lanza ConflictException si el código ya existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 9n });

      await expect(
        service.create({ codigo: 'EF', denominacion: 'Escuela' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.unidades.create).not.toHaveBeenCalled();
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('no permite cambiar el código, solo denominación y vigencia', async () => {
      prisma.unidades.findUnique
        .mockResolvedValueOnce({ id: 1n })
        .mockResolvedValueOnce(makeUnidadConRoles());
      prisma.unidades.update.mockResolvedValue({});

      await service.update('1', { denominacion: 'Nueva', vigente: false });

      expect(prisma.unidades.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { denominacion: 'Nueva', vigente: false },
      });
    });

    it('lanza NotFoundException si la unidad no existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue(null);

      await expect(service.update('99', { vigente: true })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── asignarUsuarios ────────────────────────────────────────────────────────

  describe('asignarUsuarios', () => {
    it('mueve solo a los usuarios que están en otra unidad y les cierra la sesión', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });
      prisma.usuarios.findMany.mockResolvedValue([
        { id: 10n, unidad_id: 2n },
        { id: 11n, unidad_id: 1n },
      ]);

      const result = await service.asignarUsuarios('1', ['10', '11']);

      expect(prisma.usuarios.update).toHaveBeenCalledTimes(1);
      expect(prisma.usuarios.update).toHaveBeenCalledWith({
        where: { id: 10n },
        data: { unidad_id: 1n },
      });
      // Cambian sus permisos efectivos: hay que forzarles el re-login.
      expect(sesiones.invalidarUsuario).toHaveBeenCalledWith(10n);
      expect(result).toEqual({ asignados: 1, yaEstaban: 1, noEncontrados: 0 });
    });

    it('no toca ninguna relación laboral', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });
      prisma.usuarios.findMany.mockResolvedValue([{ id: 10n, unidad_id: null }]);

      await service.asignarUsuarios('1', ['10']);

      // El destino del personal se gestiona desde Personal, no desde acá.
      expect(prisma.relaciones_laborales).not.toHaveProperty('updateMany');
    });

    it('informa los usuarios que no existen', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });
      prisma.usuarios.findMany.mockResolvedValue([{ id: 10n, unidad_id: null }]);

      const result = await service.asignarUsuarios('1', ['10', '99']);

      expect(result.noEncontrados).toBe(1);
    });

    it('no permite asignar usuarios a una unidad que no está vigente', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 1n, vigente: false });

      await expect(service.asignarUsuarios('1', ['10'])).rejects.toThrow(
        ConflictException,
      );
    });

    it('lanza BadRequestException si no se indica ningún usuario', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });

      await expect(service.asignarUsuarios('1', [])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── quitarUsuario ──────────────────────────────────────────────────────────

  describe('quitarUsuario', () => {
    it('deja al usuario sin unidad y le cierra la sesión', async () => {
      prisma.usuarios.findFirst.mockResolvedValue({ id: 10n });

      await service.quitarUsuario('1', '10');

      expect(prisma.usuarios.update).toHaveBeenCalledWith({
        where: { id: 10n },
        data: { unidad_id: null },
      });
      expect(sesiones.invalidarUsuario).toHaveBeenCalledWith(10n);
    });

    it('lanza NotFoundException si el usuario no pertenece a esa unidad', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(null);

      await expect(service.quitarUsuario('1', '10')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });
  });
});

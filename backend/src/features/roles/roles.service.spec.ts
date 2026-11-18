import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';

const makeRol = (overrides: Partial<any> = {}) => ({
  id: 39n,
  nombre: 'Gestor de cursos',
  descripcion: 'Rol de prueba',
  aplicacion: 'personal',
  roles_permisos: [{ permisos: { id: 9n, nombre: 'cursos.ver' } }],
  _count: { usuarios_roles: 0, sub_unidades_roles: 0 },
  ...overrides,
});

const ADMIN = { roles: ['Administrador del sistema'], permisos: [] } as unknown as AuthenticatedUser;
const GESTOR = { roles: ['Gestor'], permisos: ['cursos.ver'] } as unknown as AuthenticatedUser;

const makePrismaMock = () => ({
  roles: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  permisos: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
  },
  roles_permisos: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue({}),
  },
  $transaction: jest.fn(),
});

const makeSesionesMock = () => ({
  contarUsuariosDeRol: jest.fn().mockResolvedValue(0),
  invalidarPorRol: jest.fn().mockResolvedValue(undefined),
});

describe('RolesService', () => {
  let service: RolesService;
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
        RolesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SesionesService, useValue: sesiones },
      ],
    }).compile();

    service = module.get(RolesService);
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.roles.findFirst.mockResolvedValue(makeRol());
    });

    const dataGuardada = () => prisma.roles.update.mock.calls[0][0].data;

    it('con la descripción vacía la borra', async () => {
      await service.update('39', { descripcion: '' });

      expect(dataGuardada().descripcion).toBeNull();
    });

    it('una descripción de solo espacios también la borra', async () => {
      await service.update('39', { descripcion: '   ' });

      expect(dataGuardada().descripcion).toBeNull();
    });

    it('sin descripción no la toca', async () => {
      await service.update('39', { nombre: 'Gestor de cursos' });

      expect(dataGuardada().descripcion).toBeUndefined();
    });

    it('guarda la descripción sin espacios de más', async () => {
      await service.update('39', { descripcion: '  Nueva descripción ' });

      expect(dataGuardada().descripcion).toBe('Nueva descripción');
    });

    it('renombrar a un nombre que ya existe da 409', async () => {
      prisma.roles.findFirst
        .mockResolvedValueOnce(makeRol())
        .mockResolvedValueOnce(makeRol({ id: 40n, nombre: 'Consulta' }));

      await expect(service.update('39', { nombre: 'Consulta' })).rejects.toThrow(ConflictException);
      expect(prisma.roles.update).not.toHaveBeenCalled();
    });

    it('no deja renombrar un rol base del sistema', async () => {
      prisma.roles.findFirst.mockResolvedValue(makeRol({ nombre: 'Usuario' }));

      await expect(service.update('39', { nombre: 'Otro nombre' })).rejects.toThrow(ForbiddenException);
    });

    it('un rol que no existe da 404', async () => {
      prisma.roles.findFirst.mockResolvedValue(null);

      await expect(service.update('99', { descripcion: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('no crea un rol con un nombre repetido', async () => {
      prisma.roles.findFirst.mockResolvedValue(makeRol());

      await expect(service.create({ nombre: 'Gestor de cursos' }, ADMIN)).rejects.toThrow(ConflictException);
      expect(prisma.roles.create).not.toHaveBeenCalled();
    });

    it('rechaza permisos que no existen', async () => {
      prisma.roles.findFirst.mockResolvedValue(null);
      prisma.permisos.findMany.mockResolvedValue([{ id: 9n, nombre: 'cursos.ver' }]);

      await expect(
        service.create({ nombre: 'Nuevo', permisos: ['cursos.ver', 'inventado.ver'] }, ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('no deja dar permisos que quien crea no tiene', async () => {
      prisma.roles.findFirst.mockResolvedValue(null);
      prisma.permisos.findMany.mockResolvedValue([{ id: 1n, nombre: 'usuarios.gestionar' }]);

      await expect(
        service.create({ nombre: 'Nuevo', permisos: ['usuarios.gestionar'] }, GESTOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('crea el rol con sus permisos', async () => {
      prisma.roles.findFirst.mockResolvedValueOnce(null).mockResolvedValue(makeRol({ id: 41n, nombre: 'Nuevo' }));
      prisma.permisos.findMany.mockResolvedValue([{ id: 9n, nombre: 'cursos.ver' }]);
      prisma.roles.create.mockResolvedValue({ id: 41n });

      const rol = await service.create({ nombre: 'Nuevo', permisos: ['cursos.ver'] }, ADMIN);

      expect(prisma.roles_permisos.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ rol_id: 41n, permiso_id: 9n }] }),
      );
      expect(rol.nombre).toBe('Nuevo');
    });
  });

  describe('remove', () => {
    it('no borra un rol base del sistema', async () => {
      prisma.roles.findFirst.mockResolvedValue(makeRol({ nombre: 'Administrador del sistema' }));

      await expect(service.remove('4')).rejects.toThrow(ForbiddenException);
    });

    it('no borra un rol con usuarios', async () => {
      prisma.roles.findFirst.mockResolvedValue(makeRol({ _count: { usuarios_roles: 2, sub_unidades_roles: 0 } }));

      await expect(service.remove('39')).rejects.toThrow(ConflictException);
    });

    it('no borra un rol asignado a una base', async () => {
      prisma.roles.findFirst.mockResolvedValue(makeRol({ _count: { usuarios_roles: 0, sub_unidades_roles: 1 } }));

      await expect(service.remove('39')).rejects.toThrow(/asignado a una o más unidades/);
      expect(prisma.roles.delete).not.toHaveBeenCalled();
    });

    it('borra el rol y sus permisos', async () => {
      prisma.roles.findFirst.mockResolvedValue(makeRol());

      await service.remove('39');

      expect(prisma.roles_permisos.deleteMany).toHaveBeenCalledWith({ where: { rol_id: 39n } });
      expect(prisma.roles.delete).toHaveBeenCalledWith({ where: { id: 39n } });
    });
  });

  describe('desactivarPermiso', () => {
    it('no deja sacarle permisos al Administrador del sistema', async () => {
      prisma.roles.findFirst.mockResolvedValue(makeRol({ nombre: 'Administrador del sistema' }));

      await expect(service.desactivarPermiso('4', '9')).rejects.toThrow(ForbiddenException);
    });

    it('saca el permiso y cierra las sesiones de quienes tienen el rol', async () => {
      prisma.roles.findFirst.mockResolvedValue(makeRol());

      await service.desactivarPermiso('39', '9');

      expect(prisma.roles_permisos.deleteMany).toHaveBeenCalledWith({ where: { rol_id: 39n, permiso_id: 9n } });
      expect(sesiones.invalidarPorRol).toHaveBeenCalledWith(39n);
    });
  });
});

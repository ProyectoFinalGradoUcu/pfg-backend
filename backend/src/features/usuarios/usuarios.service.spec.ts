import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

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

const ADMIN = {
  id: '1',
  username: 'admin@fau.mil.uy',
  roles: ['Administrador del sistema'],
  permisos: [],
  unidades: [],
};

const GESTOR = {
  id: '2',
  username: 'gestor@fau.mil.uy',
  roles: ['Gestor'],
  permisos: ['usuarios.ver', 'usuarios.gestionar'],
  unidades: [],
};

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
  permisos: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  usuarios_unidades: {
    findMany: jest.fn().mockResolvedValue([]),
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
  let auditoria: { registrar: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    sesiones = makeSesionesMock();
    auditoria = { registrar: jest.fn() };
    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: prisma },
        { provide: SesionesService, useValue: sesiones },
        { provide: AuditoriaService, useValue: auditoria },
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

      const result = await service.remove('1', { ...ADMIN, id: '99' });

      expect(prisma.usuarios.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { estado: 'bloqueado', bloqueado_hasta: null, intentos_fallidos: 0 },
      });
      expect(result).toEqual({ ok: true });
    });

    it('lanza ForbiddenException si intenta deshabilitar su propio usuario', async () => {
      await expect(service.remove('1', ADMIN)).rejects.toThrow(ForbiddenException);
      expect(prisma.usuarios.findFirst).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(null);

      await expect(service.remove('99', ADMIN)).rejects.toThrow(NotFoundException);
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });
  });

  // ─── gestionar a alguien con más privilegios ─────────────────────────────────

  describe('no se puede gestionar a quien tiene más permisos', () => {
    const rol = (nombre: string, permisos: string[]) => ({
      roles: { nombre, roles_permisos: permisos.map((p) => ({ permisos: { nombre: p } })) },
    });
    const destinoCon = (roles: ReturnType<typeof rol>[], unidades: ReturnType<typeof rol>[] = []) => {
      prisma.usuarios.findFirst.mockResolvedValue(makeUsuario({ id: 5n }));
      prisma.usuarios.findUnique = jest.fn().mockResolvedValue({
        usuarios_roles: roles,
        usuarios_unidades: unidades.length ? [{ unidades: { unidades_roles: unidades } }] : [],
      });
    };

    it('un gestor no puede resetear la contraseña de un Administrador', async () => {
      destinoCon([rol('Administrador del sistema', ['usuarios.ver'])]);

      await expect(service.resetPassword('5', { password: 'NuevaPass123' } as any, GESTOR)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });

    it('un gestor no puede resetear la contraseña de quien tiene permisos que él no tiene', async () => {
      destinoCon([rol('Oficina', ['usuarios.ver', 'roles.gestionar'])]);

      await expect(service.resetPassword('5', { password: 'NuevaPass123' } as any, GESTOR)).rejects.toThrow(
        /roles\.gestionar/,
      );
    });

    it('también cuentan los permisos heredados de las unidades', async () => {
      destinoCon([], [rol('Jefe de unidad', ['personal.gestionar'])]);

      await expect(service.update('5', { estado: 'bloqueado' }, GESTOR)).rejects.toThrow(ForbiddenException);
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });

    it('un gestor no puede quitarle roles ni dar de baja a un Administrador', async () => {
      destinoCon([rol('Administrador del sistema', [])]);
      prisma.roles.findFirst.mockResolvedValue({ id: 1n, nombre: 'Administrador del sistema' });

      await expect(service.quitarRol('5', '1', GESTOR)).rejects.toThrow(ForbiddenException);
      await expect(service.remove('5', GESTOR)).rejects.toThrow(ForbiddenException);
      expect(prisma.usuarios_roles.deleteMany).not.toHaveBeenCalled();
    });

    it('un gestor sí puede resetear a quien tiene solo permisos que él también tiene', async () => {
      destinoCon([rol('Consulta', ['usuarios.ver'])]);

      await expect(service.resetPassword('5', { password: 'NuevaPass123' } as any, GESTOR)).resolves.toEqual({
        ok: true,
      });
    });

    it('el Administrador puede gestionar a cualquiera', async () => {
      destinoCon([rol('Administrador del sistema', ['todo.lo.demas'])]);

      await expect(service.resetPassword('5', { password: 'NuevaPass123' } as any, ADMIN)).resolves.toEqual({
        ok: true,
      });
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

      await service.update('1', { estado: 'activo' }, { ...ADMIN, id: '99' });

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
        service.update('1', { estado: 'bloqueado' }, ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(null);

      await expect(
        service.update('99', { estado: 'activo' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── asignarUnidades ────────────────────────────────────────────────────────

  describe('asignarUnidades', () => {
    const cg = { unidades: { id: 1n, codigo: 'CG', denominacion: 'Cuartel General' } };
    const efa = { unidades: { id: 4n, codigo: 'EFA', denominacion: 'Escuela de Formación' } };

    beforeEach(() => {
      prisma.usuarios.findFirst.mockResolvedValue({ id: 10n, username: 'jefe@fau.mil.uy' });
      prisma.unidades.findMany.mockResolvedValue([{ id: 4n, vigente: true }]);
      jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
    });

    it('audita el cambio con las unidades anteriores y las nuevas, legibles', async () => {
      prisma.usuarios_unidades.findMany
        .mockResolvedValueOnce([cg])
        .mockResolvedValueOnce([efa]);

      await service.asignarUnidades('10', ['4'], ADMIN);

      expect(auditoria.registrar).toHaveBeenCalledWith({
        usuarioId: '1',
        accion: 'unidad.asignar',
        contexto: 'Usuarios',
        entidad: 'Usuario',
        entidadId: 10n,
        detalle: {
          usuario: 'jefe@fau.mil.uy',
          unidadesAnteriores: [{ id: '1', codigo: 'CG', denominacion: 'Cuartel General' }],
          unidadesNuevas: [{ id: '4', codigo: 'EFA', denominacion: 'Escuela de Formación' }],
        },
      });
    });

    it('registra unidad.quitar cuando se le sacan todas las unidades', async () => {
      prisma.usuarios_unidades.findMany
        .mockResolvedValueOnce([cg])
        .mockResolvedValueOnce([]);

      await service.asignarUnidades('10', [], ADMIN);

      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'unidad.quitar' }),
      );
    });

    it('registra unidad.quitar si solo se sacó una de varias unidades', async () => {
      prisma.usuarios_unidades.findMany
        .mockResolvedValueOnce([cg, efa])
        .mockResolvedValueOnce([efa]);

      await service.asignarUnidades('10', ['4'], ADMIN);

      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'unidad.quitar' }),
      );
    });

    it('no audita si la unidad no existe', async () => {
      prisma.unidades.findMany.mockResolvedValue([]);

      await expect(service.asignarUnidades('10', ['99'], ADMIN)).rejects.toThrow(
        NotFoundException,
      );
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
    it('rechaza con 403 que un no administrador sume una unidad cuyos roles tienen permisos que él no tiene', async () => {
      prisma.unidades.findMany.mockResolvedValue([
        { id: 1n, vigente: true },
        { id: 4n, vigente: true },
      ]);
      prisma.usuarios_unidades.findMany.mockResolvedValue([cg]);
      prisma.permisos.findMany.mockResolvedValue([{ nombre: 'roles.gestionar' }]);

      await expect(service.asignarUnidades('10', ['1', '4'], GESTOR)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.usuarios_unidades.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── asignarRol ──────────────────────────────────────────────────────────────

  describe('asignarRol', () => {
    const rolAdmin = {
      id: 1n,
      nombre: 'Administrador del sistema',
      roles_permisos: [
        { permisos: { nombre: 'usuarios.gestionar' } },
        { permisos: { nombre: 'roles.gestionar' } },
      ],
    };

    beforeEach(() => {
      prisma.usuarios.findFirst.mockResolvedValue(makeUsuario({ id: 2n }));
      jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
    });

    it('rechaza con 403 asignar un rol con permisos que el actor no tiene', async () => {
      prisma.roles.findFirst.mockResolvedValue(rolAdmin);

      await expect(service.asignarRol('2', '1', GESTOR)).rejects.toThrow(ForbiddenException);
      expect(prisma.usuarios_roles.upsert).not.toHaveBeenCalled();
      expect(sesiones.invalidarUsuario).not.toHaveBeenCalled();
    });

    it('permite asignar un rol cuyos permisos el actor ya tiene', async () => {
      prisma.roles.findFirst.mockResolvedValue({
        id: 5n,
        nombre: 'Consulta',
        roles_permisos: [{ permisos: { nombre: 'usuarios.ver' } }],
      });

      await service.asignarRol('2', '5', GESTOR);
      expect(prisma.usuarios_roles.upsert).toHaveBeenCalled();
    });

    it('el administrador puede asignar cualquier rol', async () => {
      prisma.roles.findFirst.mockResolvedValue(rolAdmin);

      await service.asignarRol('2', '1', ADMIN);
      expect(prisma.usuarios_roles.upsert).toHaveBeenCalled();
    });
  });
});

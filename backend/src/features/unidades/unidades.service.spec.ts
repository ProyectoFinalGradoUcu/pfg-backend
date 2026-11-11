import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UnidadesService } from './unidades.service';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const COMANDO = { id: 2n, codigo: 'CAO', denominacion: 'Comando Aéreo de Operaciones' };

const makeBase = (overrides: Partial<any> = {}) => ({
  id: 1n,
  codigo: 'BAI',
  denominacion: 'B.A.I.',
  vigente: true,
  unidades: COMANDO,
  _count: { sub_unidades_roles: 1 },
  ...overrides,
});

const makeRol = (overrides: Partial<any> = {}) => ({
  id: 3n,
  nombre: 'Control de cursos',
  descripcion: 'Administra la formación de la unidad',
  roles_permisos: [{ permisos: { id: 9n, nombre: 'cursos.gestionar.unidad' } }],
  ...overrides,
});

const makeBaseConRoles = (overrides: Partial<any> = {}) => ({
  id: 1n,
  codigo: 'BAI',
  denominacion: 'B.A.I.',
  vigente: true,
  unidades: COMANDO,
  sub_unidades_roles: [{ roles: makeRol() }],
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  sub_unidades: {
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
  usuarios_sub_unidades: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  roles: {
    findFirst: jest.fn(),
  },
  sub_unidades_roles: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
});

const makeSesionesMock = () => ({
  invalidarPorSubUnidad: jest.fn().mockResolvedValue(undefined),
  invalidarUsuario: jest.fn().mockResolvedValue(undefined),
  contarUsuariosDeSubUnidad: jest.fn().mockResolvedValue(14),
});

const makeAuditoriaMock = () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('UnidadesService', () => {
  let service: UnidadesService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let sesiones: ReturnType<typeof makeSesionesMock>;
  let auditoria: ReturnType<typeof makeAuditoriaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    sesiones = makeSesionesMock();
    auditoria = makeAuditoriaMock();
    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnidadesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SesionesService, useValue: sesiones },
        { provide: AuditoriaService, useValue: auditoria },
      ],
    }).compile();

    service = module.get<UnidadesService>(UnidadesService);
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('devuelve las bases con su comando y su cantidad de roles, usuarios y funcionarios', async () => {
      prisma.sub_unidades.count.mockResolvedValue(1);
      prisma.sub_unidades.findMany.mockResolvedValue([makeBase()]);
      prisma.relaciones_laborales.count.mockResolvedValue(230);

      const result = await service.findAll({});

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        id: '1',
        codigo: 'BAI',
        denominacion: 'B.A.I.',
        vigente: true,
        comando: { id: '2', codigo: 'CAO', denominacion: 'Comando Aéreo de Operaciones' },
        cantidadRoles: 1,
        cantidadUsuarios: 14,
        cantidadFuncionarios: 230,
      });
      expect(sesiones.contarUsuariosDeSubUnidad).toHaveBeenCalledWith(1n);
      expect(prisma.relaciones_laborales.count).toHaveBeenCalledWith({
        where: { sub_unidad_id: 1n, fecha_fin: null },
      });
    });

    it('ordena por comando y después por denominación de la base', async () => {
      prisma.sub_unidades.count.mockResolvedValue(0);
      prisma.sub_unidades.findMany.mockResolvedValue([]);

      await service.findAll({});

      expect(prisma.sub_unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ unidades: { denominacion: 'asc' } }, { denominacion: 'asc' }],
        }),
      );
    });

    it('filtra por comando cuando llega unidad_id', async () => {
      prisma.sub_unidades.count.mockResolvedValue(0);
      prisma.sub_unidades.findMany.mockResolvedValue([]);

      await service.findAll({ unidad_id: '2' });

      expect(prisma.sub_unidades.count).toHaveBeenCalledWith({ where: { unidad_id: 2n } });
      expect(prisma.sub_unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { unidad_id: 2n } }),
      );
    });

    it('busca por código y denominación cuando llega el parámetro search', async () => {
      prisma.sub_unidades.count.mockResolvedValue(0);
      prisma.sub_unidades.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'B.A.I' });

      expect(prisma.sub_unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { codigo: { contains: 'B.A.I', mode: 'insensitive' } },
              { denominacion: { contains: 'B.A.I', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('limita el pageSize a 100 aunque pidan más', async () => {
      prisma.sub_unidades.count.mockResolvedValue(0);
      prisma.sub_unidades.findMany.mockResolvedValue([]);

      const result = await service.findAll({ pageSize: 500 });

      expect(result.pageSize).toBe(100);
      expect(prisma.sub_unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('devuelve la base con su comando, sus roles y los permisos que aportan', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue(makeBaseConRoles());

      const result = await service.findOne('1');

      expect(result.id).toBe('1');
      expect(result.comando).toEqual({
        id: '2',
        codigo: 'CAO',
        denominacion: 'Comando Aéreo de Operaciones',
      });
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].nombre).toBe('Control de cursos');
      expect(result.roles[0].permisos[0].nombre).toBe('cursos.gestionar.unidad');
    });

    it('devuelve la lista de roles vacía si la base no tiene ninguno asignado', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue(
        makeBaseConRoles({ sub_unidades_roles: [] }),
      );

      const result = await service.findOne('1');

      expect(result.roles).toEqual([]);
    });

    it('lanza NotFoundException si la unidad no existe', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue(null);

      await expect(service.findOne('99')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── asignarRol ─────────────────────────────────────────────────────────────

  describe('asignarRol', () => {
    it('asigna el rol e invalida las sesiones de todos los usuarios de la base', async () => {
      prisma.sub_unidades.findUnique
        .mockResolvedValueOnce({ id: 1n })
        .mockResolvedValueOnce(makeBaseConRoles({ sub_unidades_roles: [] }))
        .mockResolvedValueOnce(makeBaseConRoles());
      prisma.roles.findFirst.mockResolvedValue({ id: 3n });
      prisma.sub_unidades_roles.findUnique.mockResolvedValue(null);
      prisma.sub_unidades_roles.create.mockResolvedValue({});

      await service.asignarRol('1', '3', '7');

      expect(prisma.sub_unidades_roles.create).toHaveBeenCalledWith({
        data: { sub_unidad_id: 1n, rol_id: 3n },
      });
      expect(sesiones.invalidarPorSubUnidad).toHaveBeenCalledWith(1n);
    });

    it('audita un único evento a nivel base, con nombres legibles y su comando', async () => {
      prisma.sub_unidades.findUnique
        .mockResolvedValueOnce({ id: 1n })
        .mockResolvedValueOnce(makeBaseConRoles({ sub_unidades_roles: [] }))
        .mockResolvedValueOnce(makeBaseConRoles());
      prisma.roles.findFirst.mockResolvedValue({ id: 3n });
      prisma.sub_unidades_roles.findUnique.mockResolvedValue(null);

      await service.asignarRol('1', '3', '7');

      expect(auditoria.registrar).toHaveBeenCalledTimes(1);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          usuarioId: '7',
          accion: 'unidad_rol.agregar',
          contexto: 'Unidades',
          entidad: 'Unidad',
          entidadId: '1',
          detalle: expect.objectContaining({
            unidad: { codigo: 'BAI', denominacion: 'B.A.I.', comando: 'Comando Aéreo de Operaciones' },
            rol: expect.objectContaining({ nombre: 'Control de cursos' }),
            rolesAnteriores: [],
            rolesResultantes: ['Control de cursos'],
            usuariosAfectados: 14,
          }),
        }),
      );
    });

    it('lanza NotFoundException si la unidad no existe', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue(null);

      await expect(service.asignarRol('99', '3', '7')).rejects.toThrow(
        NotFoundException,
      );
      expect(sesiones.invalidarPorSubUnidad).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el rol no existe o es de otra aplicación', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n });
      prisma.roles.findFirst.mockResolvedValue(null);

      await expect(service.asignarRol('1', '99', '7')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ConflictException si el rol ya estaba asignado a esa unidad', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n });
      prisma.roles.findFirst.mockResolvedValue({ id: 3n });
      prisma.sub_unidades_roles.findUnique.mockResolvedValue({
        sub_unidad_id: 1n,
        rol_id: 3n,
      });

      await expect(service.asignarRol('1', '3', '7')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.sub_unidades_roles.create).not.toHaveBeenCalled();
      expect(sesiones.invalidarPorSubUnidad).not.toHaveBeenCalled();
    });
  });

  // ─── quitarRol ──────────────────────────────────────────────────────────────

  describe('quitarRol', () => {
    it('quita el rol e invalida las sesiones de la base', async () => {
      prisma.sub_unidades.findUnique
        .mockResolvedValueOnce({ id: 1n })
        .mockResolvedValueOnce(makeBaseConRoles())
        .mockResolvedValueOnce(makeBaseConRoles({ sub_unidades_roles: [] }));
      prisma.sub_unidades_roles.findUnique.mockResolvedValue({
        sub_unidad_id: 1n,
        rol_id: 3n,
      });
      prisma.sub_unidades_roles.delete.mockResolvedValue({});

      await service.quitarRol('1', '3', '7');

      expect(prisma.sub_unidades_roles.delete).toHaveBeenCalledWith({
        where: { sub_unidad_id_rol_id: { sub_unidad_id: 1n, rol_id: 3n } },
      });
      expect(sesiones.invalidarPorSubUnidad).toHaveBeenCalledWith(1n);
    });

    it('al quitar el último rol, el registro conserva sus permisos para reconstruir lo perdido', async () => {
      prisma.sub_unidades.findUnique
        .mockResolvedValueOnce({ id: 1n })
        .mockResolvedValueOnce(makeBaseConRoles())
        .mockResolvedValueOnce(makeBaseConRoles({ sub_unidades_roles: [] }));
      prisma.sub_unidades_roles.findUnique.mockResolvedValue({ sub_unidad_id: 1n, rol_id: 3n });

      await service.quitarRol('1', '3', '7');

      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'unidad_rol.quitar',
          detalle: expect.objectContaining({
            rolesAnteriores: [
              expect.objectContaining({
                nombre: 'Control de cursos',
                permisos: [{ id: '9', nombre: 'cursos.gestionar.unidad' }],
              }),
            ],
            rolesResultantes: [],
          }),
        }),
      );
    });

    it('lanza NotFoundException si el rol no estaba asignado a esa unidad', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n });
      prisma.sub_unidades_roles.findUnique.mockResolvedValue(null);

      await expect(service.quitarRol('1', '3', '7')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.sub_unidades_roles.delete).not.toHaveBeenCalled();
      expect(sesiones.invalidarPorSubUnidad).not.toHaveBeenCalled();
      expect(auditoria.registrar).not.toHaveBeenCalled();
    });
  });

  // ─── asignarUsuarios ────────────────────────────────────────────────────────

  describe('asignarUsuarios', () => {
    it('asigna solo a los usuarios que no estaban en la base y les cierra la sesión', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });
      prisma.usuarios.findMany.mockResolvedValue([
        { id: 10n },
        { id: 11n },
      ]);
      prisma.usuarios_sub_unidades.findMany.mockResolvedValueOnce([
        { usuario_id: 11n },
      ]);

      const result = await service.asignarUsuarios('1', ['10', '11'], '7');

      expect(prisma.usuarios_sub_unidades.create).toHaveBeenCalledTimes(1);
      expect(prisma.usuarios_sub_unidades.create).toHaveBeenCalledWith({
        data: { usuario_id: 10n, sub_unidad_id: 1n },
      });
      // Cambian sus permisos efectivos: hay que forzarles el re-login.
      expect(sesiones.invalidarUsuario).toHaveBeenCalledWith(10n);
      expect(result).toEqual({ asignados: 1, yaEstaban: 1, noEncontrados: 0 });
    });

    it('audita un evento por usuario asignado, con sus bases antes y después', async () => {
      const eta = {
        sub_unidades: {
          id: 2n,
          codigo: 'ETA',
          denominacion: 'E.T.A.',
          unidades: { denominacion: 'Comando Aéreo de Personal' },
        },
      };
      const bai = {
        sub_unidades: {
          id: 1n,
          codigo: 'BAI',
          denominacion: 'B.A.I.',
          unidades: { denominacion: 'Comando Aéreo de Operaciones' },
        },
      };
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });
      prisma.usuarios.findMany.mockResolvedValue([{ id: 10n, username: 'jefe@fau.mil.uy' }]);
      prisma.usuarios_sub_unidades.findMany
        .mockResolvedValueOnce([]) // ya asignados
        .mockResolvedValueOnce([eta]) // antes
        .mockResolvedValueOnce([eta, bai]); // después

      await service.asignarUsuarios('1', ['10'], '7');

      expect(auditoria.registrar).toHaveBeenCalledWith({
        usuarioId: '7',
        accion: 'unidad.asignar',
        contexto: 'Usuarios',
        entidad: 'Usuario',
        entidadId: 10n,
        detalle: {
          usuario: 'jefe@fau.mil.uy',
          unidadesAnteriores: [
            { id: '2', codigo: 'ETA', denominacion: 'E.T.A.', comando: 'Comando Aéreo de Personal' },
          ],
          unidadesNuevas: [
            { id: '2', codigo: 'ETA', denominacion: 'E.T.A.', comando: 'Comando Aéreo de Personal' },
            { id: '1', codigo: 'BAI', denominacion: 'B.A.I.', comando: 'Comando Aéreo de Operaciones' },
          ],
        },
      });
    });

    it('no toca ninguna relación laboral', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });
      prisma.usuarios.findMany.mockResolvedValue([{ id: 10n }]);
      prisma.usuarios_sub_unidades.findMany.mockResolvedValue([]);

      await service.asignarUsuarios('1', ['10'], '7');

      // El destino del personal se gestiona desde Personal, no desde acá.
      expect(prisma.relaciones_laborales).not.toHaveProperty('updateMany');
    });

    it('informa los usuarios que no existen', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });
      prisma.usuarios.findMany.mockResolvedValue([{ id: 10n }]);
      prisma.usuarios_sub_unidades.findMany.mockResolvedValue([]);

      const result = await service.asignarUsuarios('1', ['10', '99'], '7');

      expect(result.noEncontrados).toBe(1);
    });

    it('no permite asignar usuarios a una base que no está vigente', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n, vigente: false });

      await expect(service.asignarUsuarios('1', ['10'], '7')).rejects.toThrow(
        ConflictException,
      );
    });

    it('lanza BadRequestException si no se indica ningún usuario', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({ id: 1n, vigente: true });

      await expect(service.asignarUsuarios('1', [], '7')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── quitarUsuario ──────────────────────────────────────────────────────────

  describe('quitarUsuario', () => {
    it('elimina la relación y le cierra la sesión', async () => {
      prisma.usuarios_sub_unidades.findFirst.mockResolvedValue({
        usuario_id: 10n,
        sub_unidad_id: 1n,
        usuarios: { username: 'jefe@fau.mil.uy' },
      });
      prisma.usuarios_sub_unidades.findMany.mockResolvedValue([
        {
          sub_unidades: {
            id: 1n,
            codigo: 'BAI',
            denominacion: 'B.A.I.',
            unidades: { denominacion: 'Comando Aéreo de Operaciones' },
          },
        },
      ]);

      await service.quitarUsuario('1', '10', '7');

      expect(prisma.usuarios_sub_unidades.delete).toHaveBeenCalledWith({
        where: { usuario_id_sub_unidad_id: { usuario_id: 10n, sub_unidad_id: 1n } },
      });
      expect(sesiones.invalidarUsuario).toHaveBeenCalledWith(10n);
      expect(auditoria.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'unidad.quitar',
          entidad: 'Usuario',
          entidadId: '10',
          detalle: {
            usuario: 'jefe@fau.mil.uy',
            unidadesAnteriores: [
              { id: '1', codigo: 'BAI', denominacion: 'B.A.I.', comando: 'Comando Aéreo de Operaciones' },
            ],
            unidadesNuevas: [],
          },
        }),
      );
    });

    it('lanza NotFoundException si el usuario no pertenece a esa unidad', async () => {
      prisma.usuarios_sub_unidades.findFirst.mockResolvedValue(null);

      await expect(service.quitarUsuario('1', '10', '7')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.usuarios_sub_unidades.delete).not.toHaveBeenCalled();
    });
  });
});

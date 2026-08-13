import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

// `bcrypt` es un modulo nativo: mockearlo evita depender del binario compilado y hace
// deterministica la comparacion de password, que no es lo que se prueba en esta suite.
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hash'),
}));

import { AuthService } from './auth.service';
import { PrismaService } from '../../lib/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePermiso = (nombre: string) => ({ permisos: { id: 1n, nombre } });

const makeRol = (nombre: string, permisos: string[]) => ({
  roles: {
    id: 1n,
    nombre,
    roles_permisos: permisos.map(makePermiso),
  },
});

const makeUnidad = (roles: ReturnType<typeof makeRol>[] = []) => ({
  id: 7n,
  codigo: 'EF',
  denominacion: 'Escuela de Formación',
  unidades_roles: roles,
});

const makeUsuario = (overrides: Partial<any> = {}) => ({
  id: 1n,
  username: 'jperez',
  password_hash: 'hash',
  estado: 'activo',
  intentos_fallidos: 0,
  bloqueado_hasta: null,
  usuarios_roles: [],
  // Unidad de la CUENTA: se asigna en usuarios.unidad_id, no se deriva de la persona.
  unidades: null,
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  usuarios: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'secreto-de-test-con-al-menos-32-caracteres';
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: { enviar: jest.fn() } },
        { provide: AuditoriaService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  const login = () => service.signIn({ username: 'jperez', password: 'x' });

  // ─── signIn: unión de permisos ──────────────────────────────────────────────

  describe('signIn', () => {
    it('un usuario sin unidad conserva exactamente los permisos de sus roles directos', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['personas.ver'])],
          unidades: null,
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['personas.ver']);
      expect(user.unidadId).toBeNull();
      expect(user.unidadDenominacion).toBeNull();
    });

    it('un usuario sin unidad asignada no hereda nada', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['personas.ver'])],
          unidades: null,
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['personas.ver']);
      expect(user.unidadId).toBeNull();
    });

    it('hereda los permisos de los roles de su unidad sin tener roles directos', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [],
          unidades: makeUnidad([
            makeRol('Control de cursos', ['cursos.gestionar.unidad']),
          ]),
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['cursos.gestionar.unidad']);
      expect(user.roles).toEqual(['Control de cursos']);
      expect(user.unidadId).toBe('7');
      expect(user.unidadDenominacion).toBe('Escuela de Formación');
    });

    it('devuelve la unión de los permisos directos y los de la unidad', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['personas.ver'])],
          unidades: makeUnidad([makeRol('Control de cursos', ['cursos.gestionar'])]),
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['personas.ver', 'cursos.gestionar']);
    });

    it('no duplica un permiso que llega por rol directo y por unidad a la vez', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['cursos.ver'])],
          unidades: makeUnidad([
            makeRol('Control de cursos', ['cursos.ver', 'cursos.gestionar']),
          ]),
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['cursos.ver', 'cursos.gestionar']);
      expect(user.permisos.filter((p) => p === 'cursos.ver')).toHaveLength(1);
    });

    it('solo deja los roles directos si la unidad no tiene ningún rol asignado', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['personas.ver'])],
          unidades: makeUnidad([]),
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['personas.ver']);
      expect(user.unidadId).toBe('7');
    });

    it('firma la unidad dentro del token para que el guard resuelva el alcance', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          unidades: makeUnidad([]),
        }),
      );

      const { token } = await login();
      const payload = jwt.decode(token) as Record<string, unknown>;

      expect(payload.unidadId).toBe('7');
      expect(payload.iat).toEqual(expect.any(Number));
    });

    it('lanza UnauthorizedException con credenciales inválidas', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(null);

      await expect(login()).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── assertUsuarioActivo: invalidación de sesiones ──────────────────────────

  describe('assertUsuarioActivo', () => {
    const enSegundos = (d: Date) => Math.floor(d.getTime() / 1000);

    it('acepta un token emitido después de la invalidación', async () => {
      const invalidacion = new Date('2026-01-01T10:00:00Z');
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'activo',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: invalidacion,
      });

      await expect(
        service.assertUsuarioActivo('1', enSegundos(invalidacion) + 60),
      ).resolves.toBeUndefined();
    });

    it('rechaza un token emitido antes de la invalidación', async () => {
      const invalidacion = new Date('2026-01-01T10:00:00Z');
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'activo',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: invalidacion,
      });

      await expect(
        service.assertUsuarioActivo('1', enSegundos(invalidacion) - 60),
      ).rejects.toThrow('Sesión expirada por cambio de permisos');
    });

    it('acepta un token emitido en el mismo segundo de la invalidación (comparación truncada)', async () => {
      const invalidacion = new Date('2026-01-01T10:00:00.750Z');
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'activo',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: invalidacion,
      });

      await expect(
        service.assertUsuarioActivo('1', enSegundos(invalidacion)),
      ).resolves.toBeUndefined();
    });

    it('no invalida nada si el usuario nunca tuvo un cambio de permisos', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'activo',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: null,
      });

      await expect(
        service.assertUsuarioActivo('1', 1000),
      ).resolves.toBeUndefined();
    });

    it('rechaza si el usuario está inactivo', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'bloqueado',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: null,
      });

      await expect(service.assertUsuarioActivo('1', 1000)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

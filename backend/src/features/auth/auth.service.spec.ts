import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';

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

const makeBase = (roles: ReturnType<typeof makeRol>[] = []) => ({
  sub_unidades: {
    id: 7n,
    codigo: 'EF',
    denominacion: 'Escuela de Formación',
    unidades: { id: 2n, denominacion: 'Comando Aéreo de Personal' },
    sub_unidades_roles: roles,
  },
});

const EFA = {
  id: '7',
  denominacion: 'Escuela de Formación',
  comando: { id: '2', denominacion: 'Comando Aéreo de Personal' },
};

const makeUsuario = (overrides: Partial<any> = {}) => ({
  id: 1n,
  username: 'jperez',
  password_hash: 'hash',
  estado: 'activo',
  intentos_fallidos: 0,
  bloqueado_hasta: null,
  usuarios_roles: [],
  // Bases de la CUENTA: relación N:M via usuarios_sub_unidades.
  usuarios_sub_unidades: [],
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
    it('un usuario sin bases conserva exactamente los permisos de sus roles directos', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['personas.ver'])],
          usuarios_sub_unidades: [],
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['personas.ver']);
      expect(user.unidades).toEqual([]);
    });

    it('un usuario sin bases asignadas no hereda nada', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['personas.ver'])],
          usuarios_sub_unidades: [],
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['personas.ver']);
      expect(user.unidades).toEqual([]);
    });

    it('hereda los permisos de los roles de su base sin tener roles directos', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [],
          usuarios_sub_unidades: [
            makeBase([
              makeRol('Control de cursos', ['cursos.gestionar.unidad']),
            ]),
          ],
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['cursos.gestionar.unidad']);
      expect(user.roles).toEqual(['Control de cursos']);
      expect(user.unidades).toEqual([EFA]);
    });

    it('devuelve la unión de los permisos directos y los de la base', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['personas.ver'])],
          usuarios_sub_unidades: [makeBase([makeRol('Control de cursos', ['cursos.gestionar'])])],
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['personas.ver', 'cursos.gestionar']);
    });

    it('no duplica un permiso que llega por rol directo y por base a la vez', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['cursos.ver'])],
          usuarios_sub_unidades: [
            makeBase([
              makeRol('Control de cursos', ['cursos.ver', 'cursos.gestionar']),
            ]),
          ],
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['cursos.ver', 'cursos.gestionar']);
      expect(user.permisos.filter((p) => p === 'cursos.ver')).toHaveLength(1);
    });

    it('solo deja los roles directos si la base no tiene ningún rol asignado', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_roles: [makeRol('Usuario', ['personas.ver'])],
          usuarios_sub_unidades: [makeBase([])],
        }),
      );

      const { user } = await login();

      expect(user.permisos).toEqual(['personas.ver']);
      expect(user.unidades).toEqual([EFA]);
    });

    it('firma las bases con su comando dentro del token para que el guard resuelva el alcance', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(
        makeUsuario({
          usuarios_sub_unidades: [makeBase([])],
        }),
      );

      const { token } = await login();
      const payload = jwt.decode(token) as Record<string, unknown>;

      expect(payload.unidades).toEqual([EFA]);
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
        service.assertUsuarioActivo('1', { iat: enSegundos(invalidacion) + 60 }),
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
        service.assertUsuarioActivo('1', { iat: enSegundos(invalidacion) - 60 }),
      ).rejects.toThrow('Tu sesión ya no es válida');
    });

    it('un token viejo sin iatMs emitido en el mismo segundo se acepta (comparación truncada)', async () => {
      const invalidacion = new Date('2026-01-01T10:00:00.750Z');
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'activo',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: invalidacion,
      });

      await expect(
        service.assertUsuarioActivo('1', { iat: enSegundos(invalidacion) }),
      ).resolves.toBeUndefined();
    });

    // Sign-out y cambio de contraseña en el mismo segundo del login.
    it('con iatMs rechaza un token emitido milisegundos antes de la invalidación', async () => {
      const invalidacion = new Date('2026-01-01T10:00:00.750Z');
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'activo',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: invalidacion,
      });

      await expect(
        service.assertUsuarioActivo('1', {
          iat: enSegundos(invalidacion),
          iatMs: invalidacion.getTime() - 200,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('con iatMs acepta el token reemitido justo después de la invalidación', async () => {
      const invalidacion = new Date('2026-01-01T10:00:00.750Z');
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'activo',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: invalidacion,
      });

      await expect(
        service.assertUsuarioActivo('1', {
          iat: enSegundos(invalidacion),
          iatMs: invalidacion.getTime() + 1,
        }),
      ).resolves.toBeUndefined();
    });

    it('no invalida nada si el usuario nunca tuvo un cambio de permisos', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'activo',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: null,
      });

      await expect(
        service.assertUsuarioActivo('1', { iat: 1000 }),
      ).resolves.toBeUndefined();
    });

    it('rechaza si el usuario está inactivo', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({
        estado: 'bloqueado',
        bloqueado_hasta: null,
        sesiones_invalidas_desde: null,
      });

      await expect(service.assertUsuarioActivo('1', { iat: 1000 })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── solicitarResetPassword: aislamiento por aplicación ─────────────────────

  describe('solicitarResetPassword', () => {
    it('busca el usuario solo entre las cuentas de la aplicación personal', async () => {
      prisma.usuarios.findFirst.mockResolvedValue(null);

      await service.solicitarResetPassword({ username: 'jperez' });

      expect(prisma.usuarios.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { username: 'jperez', aplicacion: 'personal' },
        }),
      );
    });

    it('si el username solo existe en otra aplicación responde ok sin generar token ni mandar mail', async () => {
      // El filtro por aplicación hace que Prisma no encuentre la cuenta de liquidación.
      prisma.usuarios.findFirst.mockResolvedValue(null);

      await expect(
        service.solicitarResetPassword({ username: 'admin' }),
      ).resolves.toEqual({ ok: true });
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });
  });

  // ─── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword', () => {
    const dto = { passwordActual: 'Vieja123!', passwordNueva: 'Nueva123!' };

    it('con la contraseña actual incorrecta lanza 400, no 401, y no cambia el hash', async () => {
      // Un 401 haría que el frontend tome la sesión por terminada y desloguee (SCRUM-149).
      prisma.usuarios.findUnique.mockResolvedValue(makeUsuario());
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.changePassword('1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });

    it('con la contraseña actual correcta guarda el hash nuevo', async () => {
      prisma.usuarios.findUnique.mockResolvedValue(makeUsuario());

      await service.changePassword('1', dto);

      expect(prisma.usuarios.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ password_hash: 'hash' }) }),
      );
    });

    it('invalida las sesiones abiertas en el mismo update del hash', async () => {
      prisma.usuarios.findUnique.mockResolvedValue(makeUsuario());

      await service.changePassword('1', dto);

      expect(prisma.usuarios.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sesiones_invalidas_desde: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── cerrarSesiones / reemitirSesion ────────────────────────────────────────

  describe('cerrarSesiones', () => {
    it('marca sesiones_invalidas_desde del usuario', async () => {
      await service.cerrarSesiones('1');

      expect(prisma.usuarios.updateMany).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { sesiones_invalidas_desde: expect.any(Date) },
      });
    });
  });

  describe('reemitirSesion', () => {
    it('firma un token con iatMs para que sobreviva a la invalidación recién hecha', async () => {
      prisma.usuarios.findUnique.mockResolvedValue(makeUsuario());
      const antes = Date.now();

      const { token } = await service.reemitirSesion('1');

      const payload = jwt.decode(token) as { iatMs?: number };
      expect(payload.iatMs).toBeGreaterThanOrEqual(antes);
    });

    it('no reemite si el usuario ya no está activo', async () => {
      prisma.usuarios.findUnique.mockResolvedValue(makeUsuario({ estado: 'bloqueado' }));

      await expect(service.reemitirSesion('1')).rejects.toThrow(UnauthorizedException);
    });
  });
});

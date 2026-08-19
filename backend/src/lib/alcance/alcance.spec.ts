import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AlcanceGuard } from './alcance.guard';
import { ALCANCE_KEY } from './alcance.decorator';
import { AlcanceResuelto, unidadIdsDeAlcance, unidadIdDeAlcance } from './alcance.types';
import {
  assertCursoGestionableEnAlcance,
  assertCursoVisibleEnAlcance,
  assertPersonaEnAlcance,
  whereCursosVisiblesPorAlcance,
  wherePersonasPorAlcance,
} from './alcance.where';
import { PrismaService } from '../prisma.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<any> = {}) => ({
  id: '1',
  username: 'jperez',
  roles: [],
  permisos: [],
  unidades: [],
  ...overrides,
});

const GLOBAL: AlcanceResuelto = { tipo: 'global' };
const UNIDAD: AlcanceResuelto = { tipo: 'unidad', unidadIds: ['7'] };
const MULTI_UNIDAD: AlcanceResuelto = { tipo: 'unidad', unidadIds: ['7', '8'] };

const makeContext = (user: any) => {
  const request: Record<string, unknown> = { user };
  return {
    request,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext,
  };
};

const makeReflector = (permisoBase?: string) =>
  ({
    getAllAndOverride: jest.fn().mockReturnValue(permisoBase),
  }) as unknown as Reflector;

const makePrismaMock = () => ({
  personas: { findFirst: jest.fn() },
  cursos: { findFirst: jest.fn() },
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AlcanceGuard', () => {
  it('deja pasar sin resolver alcance si el endpoint no está marcado con @RequireAlcance', () => {
    const guard = new AlcanceGuard(makeReflector(undefined));
    const { ctx, request } = makeContext(makeUser());

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.alcance).toBeUndefined();
  });

  it('resuelve alcance global si el usuario tiene el permiso base', () => {
    const guard = new AlcanceGuard(makeReflector('personas.ver'));
    const { ctx, request } = makeContext(
      makeUser({ permisos: ['personas.ver'] }),
    );

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.alcance).toEqual({ tipo: 'global' });
  });

  it('resuelve alcance de unidad si el usuario solo tiene la variante .unidad', () => {
    const guard = new AlcanceGuard(makeReflector('personas.ver'));
    const { ctx, request } = makeContext(
      makeUser({ permisos: ['personas.ver.unidad'], unidades: [{ id: '7', denominacion: 'EF' }] }),
    );

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.alcance).toEqual({ tipo: 'unidad', unidadIds: ['7'] });
  });

  it('el permiso global gana si el usuario tiene los dos', () => {
    const guard = new AlcanceGuard(makeReflector('personas.ver'));
    const { ctx, request } = makeContext(
      makeUser({
        permisos: ['personas.ver', 'personas.ver.unidad'],
        unidades: [{ id: '7', denominacion: 'EF' }],
      }),
    );

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.alcance).toEqual({ tipo: 'global' });
  });

  it('lanza ForbiddenException si tiene alcance de unidad pero no tiene unidades asignadas', () => {
    const guard = new AlcanceGuard(makeReflector('personas.ver'));
    const { ctx } = makeContext(
      makeUser({ permisos: ['personas.ver.unidad'], unidades: [] }),
    );

    // No se degrada a global bajo ninguna circunstancia.
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException si el usuario no tiene ninguna de las dos variantes', () => {
    const guard = new AlcanceGuard(makeReflector('personas.ver'));
    const { ctx } = makeContext(makeUser({ permisos: ['cursos.ver'] }));

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException si no hay usuario autenticado', () => {
    const guard = new AlcanceGuard(makeReflector('personas.ver'));
    const { ctx } = makeContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lee el permiso base desde el handler y la clase', () => {
    const reflector = makeReflector('personas.ver');
    const guard = new AlcanceGuard(reflector);
    const { ctx } = makeContext(makeUser({ permisos: ['personas.ver'] }));

    guard.canActivate(ctx);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ALCANCE_KEY,
      expect.any(Array),
    );
  });
});

describe('unidadIdsDeAlcance', () => {
  it('devuelve null con alcance global', () => {
    expect(unidadIdsDeAlcance(GLOBAL)).toBeNull();
  });

  it('devuelve un array de bigints con alcance de unidad', () => {
    expect(unidadIdsDeAlcance(UNIDAD)).toEqual([7n]);
  });

  it('devuelve múltiples bigints con alcance multi-unidad', () => {
    expect(unidadIdsDeAlcance(MULTI_UNIDAD)).toEqual([7n, 8n]);
  });
});

describe('unidadIdDeAlcance (compat)', () => {
  it('devuelve null con alcance global', () => {
    expect(unidadIdDeAlcance(GLOBAL)).toBeNull();
  });

  it('devuelve el primer id como bigint con alcance de unidad', () => {
    expect(unidadIdDeAlcance(UNIDAD)).toBe(7n);
  });
});

describe('wherePersonasPorAlcance', () => {
  it('no restringe nada con alcance global', () => {
    expect(wherePersonasPorAlcance(GLOBAL)).toEqual({});
  });

  it('filtra por relación laboral activa en la unidad con alcance de unidad', () => {
    expect(wherePersonasPorAlcance(UNIDAD)).toEqual({
      relaciones_laborales: { some: { fecha_fin: null, unidad_id: { in: [7n] } } },
    });
  });

  it('filtra por múltiples unidades con alcance multi-unidad', () => {
    expect(wherePersonasPorAlcance(MULTI_UNIDAD)).toEqual({
      relaciones_laborales: { some: { fecha_fin: null, unidad_id: { in: [7n, 8n] } } },
    });
  });
});

describe('whereCursosVisiblesPorAlcance', () => {
  it('no restringe nada con alcance global', () => {
    expect(whereCursosVisiblesPorAlcance(GLOBAL)).toEqual({});
  });

  it('incluye los cursos de la unidad y los generales con alcance de unidad', () => {
    expect(whereCursosVisiblesPorAlcance(UNIDAD)).toEqual({
      OR: [{ unidad_id: { in: [7n] } }, { unidad_id: null }],
    });
  });
});

describe('assertPersonaEnAlcance', () => {
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
  });

  it('no consulta la base con alcance global', async () => {
    await assertPersonaEnAlcance(
      prisma as unknown as PrismaService,
      10n,
      GLOBAL,
    );

    expect(prisma.personas.findFirst).not.toHaveBeenCalled();
  });

  it('pasa si la persona pertenece a la unidad', async () => {
    prisma.personas.findFirst.mockResolvedValue({ id: 10n });

    await expect(
      assertPersonaEnAlcance(prisma as unknown as PrismaService, 10n, UNIDAD),
    ).resolves.toBeUndefined();
  });

  it('lanza NotFoundException y no ForbiddenException si la persona es de otra unidad', async () => {
    prisma.personas.findFirst.mockResolvedValue(null);

    // 404 a propósito: un 403 confirmaría que el registro existe y permitiría
    // enumerar el padrón por IDs.
    await expect(
      assertPersonaEnAlcance(prisma as unknown as PrismaService, 10n, UNIDAD),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('assertCursoVisibleEnAlcance', () => {
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
  });

  it('acepta un curso general porque los generales son visibles para todos', async () => {
    prisma.cursos.findFirst.mockResolvedValue({ id: 1n });

    await expect(
      assertCursoVisibleEnAlcance(prisma as unknown as PrismaService, 1n, UNIDAD),
    ).resolves.toBeUndefined();

    expect(prisma.cursos.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1n, OR: [{ unidad_id: { in: [7n] } }, { unidad_id: null }] },
      }),
    );
  });

  it('lanza NotFoundException si el curso es de otra unidad', async () => {
    prisma.cursos.findFirst.mockResolvedValue(null);

    await expect(
      assertCursoVisibleEnAlcance(prisma as unknown as PrismaService, 1n, UNIDAD),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('assertCursoGestionableEnAlcance', () => {
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
  });

  it('exige que el curso sea de la propia unidad, sin aceptar los generales', async () => {
    prisma.cursos.findFirst.mockResolvedValue({ id: 1n });

    await assertCursoGestionableEnAlcance(
      prisma as unknown as PrismaService,
      1n,
      UNIDAD,
    );

    expect(prisma.cursos.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1n, unidad_id: { in: [7n] } } }),
    );
  });

  it('lanza NotFoundException si el curso es general y el alcance es de unidad', async () => {
    prisma.cursos.findFirst.mockResolvedValue(null);

    await expect(
      assertCursoGestionableEnAlcance(
        prisma as unknown as PrismaService,
        1n,
        UNIDAD,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

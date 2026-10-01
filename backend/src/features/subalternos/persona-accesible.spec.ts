import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { PersonaAccesibleGuard } from './persona-accesible';

const makePrismaMock = () => ({
  personas: { findUnique: jest.fn(), findFirst: jest.fn() },
});

const contextoCon = (req: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

describe('PersonaAccesibleGuard', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let guard: PersonaAccesibleGuard;

  beforeEach(() => {
    prisma = makePrismaMock();
    guard = new PersonaAccesibleGuard(prisma as any);
  });

  it('deja pasar si la persona existe y el alcance es global', async () => {
    prisma.personas.findUnique.mockResolvedValue({ id: 42n });

    await expect(
      guard.canActivate(contextoCon({ params: { personaId: '42' }, alcance: { tipo: 'global' } })),
    ).resolves.toBe(true);
  });

  it('404 si la persona no existe', async () => {
    prisma.personas.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextoCon({ params: { personaId: '999' }, alcance: { tipo: 'global' } })),
    ).rejects.toThrow(NotFoundException);
  });

  it('404 si la persona está fuera del alcance de unidad, antes de mirar el archivo', async () => {
    prisma.personas.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextoCon({ params: { personaId: '42' }, alcance: { tipo: 'unidad', unidadIds: ['3'] } }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('un id no numérico lo deja para ParseIntPipe, sin consultar la base', async () => {
    await expect(
      guard.canActivate(contextoCon({ params: { personaId: 'abc' }, alcance: { tipo: 'global' } })),
    ).resolves.toBe(true);
    expect(prisma.personas.findUnique).not.toHaveBeenCalled();
  });
});

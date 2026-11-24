import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { assertPersonaVinculable } from './persona-vinculable';
import type { AuthenticatedUser } from '../auth/types/auth.types';

const actor = (permisos: string[], baseIds: string[] = []): AuthenticatedUser => ({
  id: '1',
  username: 'gestor@fau.mil.uy',
  roles: [],
  permisos,
  unidades: baseIds.map((id) => ({ id, denominacion: `Base ${id}`, comando: { id: '3', denominacion: 'C.A.O.' } })),
});

describe('assertPersonaVinculable', () => {
  let prisma: {
    personas: { findUnique: jest.Mock; findFirst: jest.Mock };
    usuarios: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      personas: {
        findUnique: jest.fn().mockResolvedValue({ id: 9n }),
        findFirst: jest.fn().mockResolvedValue({ id: 9n }),
      },
      usuarios: { findFirst: jest.fn().mockResolvedValue(null) },
    };
  });

  it('con alcance global y la persona libre devuelve su id', async () => {
    await expect(assertPersonaVinculable(prisma as never, '9', actor(['personas.ver']))).resolves.toBe(9n);
  });

  it('rechaza un id que no es numérico sin llegar a la base', async () => {
    await expect(assertPersonaVinculable(prisma as never, 'abc', actor(['personas.ver']))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.personas.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza una persona que no existe', async () => {
    prisma.personas.findUnique.mockResolvedValue(null);
    await expect(assertPersonaVinculable(prisma as never, '9', actor(['personas.ver']))).rejects.toThrow(
      'La persona indicada no existe',
    );
  });

  it('con alcance de unidad rechaza a alguien de otra base con el mismo mensaje que si no existiera', async () => {
    prisma.personas.findFirst.mockResolvedValue(null);
    await expect(
      assertPersonaVinculable(prisma as never, '9', actor(['personas.ver.unidad'], ['12'])),
    ).rejects.toThrow('La persona indicada no existe');
    expect(prisma.personas.findFirst.mock.calls[0][0].where.relaciones_laborales.some.sub_unidad_id).toEqual({
      in: [12n],
    });
  });

  it('con alcance de unidad acepta a alguien de sus bases', async () => {
    await expect(
      assertPersonaVinculable(prisma as never, '9', actor(['personas.ver.unidad'], ['12'])),
    ).resolves.toBe(9n);
  });

  it('sin permiso para ver personal no deja vincular', async () => {
    await expect(assertPersonaVinculable(prisma as never, '9', actor(['usuarios.gestionar']))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechaza a un funcionario que ya está vinculado a otra cuenta y dice a cuál', async () => {
    prisma.usuarios.findFirst.mockResolvedValue({ username: 'otro@fau.mil.uy' });
    await expect(assertPersonaVinculable(prisma as never, '9', actor(['personas.ver']), 5n)).rejects.toThrow(
      new ConflictException('Ese funcionario ya está vinculado al usuario otro@fau.mil.uy'),
    );
    expect(prisma.usuarios.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ persona_id: 9n, id: { not: 5n } }),
    );
  });
});

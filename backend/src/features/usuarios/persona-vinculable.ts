import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { APLICACION } from '../../lib/aplicacion.const';
import { AlcanceResuelto, assertPersonaEnAlcance, permisoDeUnidad } from '../../lib/alcance';
import type { AuthenticatedUser } from '../auth/types/auth.types';

const NO_EXISTE = 'La persona indicada no existe';

function alcancePersonas(actor: AuthenticatedUser): AlcanceResuelto | null {
  if (actor.permisos.includes('personas.ver')) return { tipo: 'global' };
  if (actor.permisos.includes(permisoDeUnidad('personas.ver')) && actor.unidades?.length) {
    return {
      tipo: 'unidad',
      subUnidadIds: actor.unidades.map((u) => u.id),
      comandoIds: [...new Set(actor.unidades.map((u) => u.comando.id))],
    };
  }
  return null;
}

/** Solo se vincula a alguien que el actor puede ver, y a una sola cuenta de Personal. */
export async function assertPersonaVinculable(
  prisma: PrismaService,
  personaId: string,
  actor: AuthenticatedUser,
  usuarioId?: bigint,
): Promise<bigint> {
  if (!/^\d+$/.test(personaId)) throw new BadRequestException(NO_EXISTE);
  const id = BigInt(personaId);

  const alcance = alcancePersonas(actor);
  if (!alcance) {
    throw new ForbiddenException('Para vincular un funcionario necesitás permiso para ver personal');
  }

  const persona = await prisma.personas.findUnique({ where: { id }, select: { id: true } });
  if (!persona) throw new BadRequestException(NO_EXISTE);
  // Fuera de alcance responde igual que si no existiera, para no confirmar que existe.
  try {
    await assertPersonaEnAlcance(prisma, id, alcance);
  } catch (err) {
    if (err instanceof NotFoundException) throw new BadRequestException(NO_EXISTE);
    throw err;
  }

  const otro = await prisma.usuarios.findFirst({
    where: { persona_id: id, aplicacion: APLICACION, ...(usuarioId ? { id: { not: usuarioId } } : {}) },
    select: { username: true },
  });
  if (otro) throw new ConflictException(`Ese funcionario ya está vinculado al usuario ${otro.username}`);

  return id;
}

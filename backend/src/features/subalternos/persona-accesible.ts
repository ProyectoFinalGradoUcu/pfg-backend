import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../lib/prisma.service.js';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { assertPersonaEnAlcance } from '../../lib/alcance/alcance.where.js';

/** 404 y no 403 si no existe o está fuera de alcance: un 403 confirmaría que la persona existe. */
export async function assertPersonaAccesible(
  prisma: PrismaService,
  personaId: bigint,
  alcance?: AlcanceResuelto,
): Promise<void> {
  if (alcance) await assertPersonaEnAlcance(prisma, personaId, alcance);
  const persona = await prisma.personas.findUnique({
    where: { id: personaId },
    select: { id: true },
  });
  if (!persona) throw new NotFoundException(`No existe personal con id ${personaId}`);
}

/**
 * Corre antes que los interceptores y los pipes: una persona inaccesible da 404 antes de
 * que multer lea el archivo y antes de validarlo. Usa el `alcance` que dejó AlcanceGuard.
 */
@Injectable()
export class PersonaAccesibleGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto
      .switchToHttp()
      .getRequest<Request & { alcance?: AlcanceResuelto }>();
    const id = Number(req.params.personaId);
    // Un id que no es entero positivo lo rechaza ParseIntPipe con 400.
    if (!Number.isSafeInteger(id) || id <= 0) return true;
    await assertPersonaAccesible(this.prisma, BigInt(id), req.alcance);
    return true;
  }
}

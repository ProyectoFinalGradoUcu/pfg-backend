import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { wherePersonasPorAlcance } from '../../lib/alcance/alcance.where';

/** SCRUM-207: validar el lote antes de escribir y no revelar personas fuera de alcance. */
export async function assertPersonasCursos(tx: Prisma.TransactionClient, ids: bigint[], alcance?: AlcanceResuelto) {
  const personas = await tx.personas.findMany({
    where: { id: { in: ids }, ...(alcance && wherePersonasPorAlcance(alcance)) },
    select: { id: true },
  });
  if (personas.length !== ids.length) throw new NotFoundException('Una o más personas no existen o están fuera del alcance');
}

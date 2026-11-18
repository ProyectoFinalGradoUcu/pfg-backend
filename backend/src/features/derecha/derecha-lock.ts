import { Prisma } from '@prisma/client';
import { LOCK_DERECHA } from './derecha.constants.js';

export async function bloquearDerecha(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_DERECHA})`;
}

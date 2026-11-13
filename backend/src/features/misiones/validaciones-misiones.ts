import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type FechasConvocatoria = { fecha_salida: Date | null; fecha_llegada: Date | null };

export function validarFechasConvocatoria(fechas: FechasConvocatoria) {
  if (fechas.fecha_salida && fechas.fecha_llegada && fechas.fecha_llegada < fechas.fecha_salida) {
    throw new BadRequestException('La fecha de llegada no puede ser anterior a la fecha de salida');
  }
}

/** Serializa todas las puertas de escritura, incluida la carga Excel y las ediciones de fechas. */
export async function bloquearConvocatorias(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(72104, 1)`;
}

export async function validarParticipantes(
  tx: Prisma.TransactionClient, ids: bigint[], fechas: FechasConvocatoria, excluir?: bigint,
) {
  validarFechasConvocatoria(fechas);
  if (!ids.length) return;
  const personas = await tx.personas.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (personas.length !== ids.length) throw new NotFoundException('Una o más personas no existen en el sistema');
  // Fechas desconocidas son extremos abiertos: no se asume que no hay conflicto.
  const conflicto = await tx.funcionarios_convocatorias.findFirst({
    where: {
      persona_id: { in: ids },
      ...(excluir !== undefined && { convocatoria_id: { not: excluir } }),
      convocatorias: { AND: [
        ...(fechas.fecha_llegada ? [{ OR: [{ fecha_salida: null }, { fecha_salida: { lte: fechas.fecha_llegada } }] }] : []),
        ...(fechas.fecha_salida ? [{ OR: [{ fecha_llegada: null }, { fecha_llegada: { gte: fechas.fecha_salida } }] }] : []),
      ] },
    },
    select: { persona_id: true, convocatoria_id: true },
  });
  if (conflicto) throw new ConflictException(`La persona ${conflicto.persona_id} tiene una convocatoria con fechas solapadas (${conflicto.convocatoria_id}). El regreso anterior debe ser menor que la siguiente salida.`);
}

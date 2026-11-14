import { PrismaService } from '../../lib/prisma.service';

// Llegada null = sigue en misión. Sin salida no hay período, así que no se compara.
export async function buscarSolapamientos(
  prisma: PrismaService,
  personaIds: bigint[],
  salida: Date | null,
  llegada: Date | null,
  convocatoriaPropiaId?: bigint,
) {
  if (!salida || personaIds.length === 0) return [];

  return prisma.funcionarios_convocatorias.findMany({
    where: {
      persona_id: { in: personaIds },
      ...(convocatoriaPropiaId !== undefined && {
        convocatoria_id: { not: convocatoriaPropiaId },
      }),
      convocatorias: {
        fecha_salida: llegada ? { lte: llegada } : { not: null },
        OR: [{ fecha_llegada: null }, { fecha_llegada: { gte: salida } }],
      },
    },
    select: {
      personas: { select: { primer_nombre: true, primer_apellido: true } },
      convocatorias: { select: { misiones: { select: { nombre_mision: true } } } },
    },
  });
}

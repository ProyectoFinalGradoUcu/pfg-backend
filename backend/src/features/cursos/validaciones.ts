import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { wherePersonasPorAlcance } from '../../lib/alcance/alcance.where';

export function nombreCursoValido(nombre: string): string {
  const normalizado = nombre?.trim();
  if (!normalizado) throw new BadRequestException('El nombre del curso no puede estar vacío');
  return normalizado;
}

export async function assertPersonasCursos(tx: Prisma.TransactionClient, ids: bigint[], alcance?: AlcanceResuelto) {
  const personas = await tx.personas.findMany({
    where: { id: { in: ids }, ...(alcance && wherePersonasPorAlcance(alcance)) },
    select: { id: true },
  });
  if (personas.length !== ids.length) throw new NotFoundException('Una o más personas no existen o están fuera del alcance');
}

/** Los campos omitidos se conservan. Null explícito limpia los campos opcionales. */
export function cambiosCalificacion(dto: { aprobado?: boolean | null; calificacion?: number | null; observacion?: string | null }) {
  return {
    ...(dto.aprobado !== undefined && { aprobado: dto.aprobado }),
    ...(dto.calificacion !== undefined && { calificacion: dto.calificacion === null ? null : String(dto.calificacion) }),
    ...(dto.observacion !== undefined && { observacion_calificacion: dto.observacion }),
  };
}

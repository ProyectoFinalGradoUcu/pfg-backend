import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AlcanceResuelto, unidadIdDeAlcance } from './alcance.types';

/**
 * Condición sobre `relaciones_laborales` que define la relación laboral ACTIVA.
 * Misma definición que usa `subalternos.service.ts#findAllPersonas`.
 */
export const RELACION_ACTIVA = { fecha_fin: null };

/**
 * Fragmento de `where` para listados de personas.
 * Global → sin restricción. Unidad → solo personas con relación laboral activa en esa unidad.
 */
export function wherePersonasPorAlcance(alcance: AlcanceResuelto) {
  const unidadId = unidadIdDeAlcance(alcance);
  if (unidadId === null) return {};
  return {
    relaciones_laborales: {
      some: { ...RELACION_ACTIVA, unidad_id: unidadId },
    },
  };
}

/**
 * Fragmento de `where` para listados de cursos.
 * Global → sin restricción. Unidad → cursos de la unidad MÁS los generales (`unidad_id IS NULL`).
 */
export function whereCursosVisiblesPorAlcance(alcance: AlcanceResuelto) {
  const unidadId = unidadIdDeAlcance(alcance);
  if (unidadId === null) return {};
  return { OR: [{ unidad_id: unidadId }, { unidad_id: null }] };
}

/**
 * Valida que una persona esté dentro del alcance del usuario.
 *
 * Lanza `NotFoundException` (no `ForbiddenException`) a propósito: devolver 403 confirmaría que
 * el registro existe y permitiría enumerar el padrón por IDs. Ver spec 002 §7.
 */
export async function assertPersonaEnAlcance(
  prisma: PrismaService,
  personaId: bigint,
  alcance: AlcanceResuelto,
): Promise<void> {
  const unidadId = unidadIdDeAlcance(alcance);
  if (unidadId === null) return;

  const persona = await prisma.personas.findFirst({
    where: {
      id: personaId,
      relaciones_laborales: {
        some: { ...RELACION_ACTIVA, unidad_id: unidadId },
      },
    },
    select: { id: true },
  });

  if (!persona) throw new NotFoundException('Persona no encontrada');
}

/**
 * Valida que un curso sea VISIBLE para el usuario (su unidad, o general).
 */
export async function assertCursoVisibleEnAlcance(
  prisma: PrismaService,
  cursoId: bigint,
  alcance: AlcanceResuelto,
): Promise<void> {
  const unidadId = unidadIdDeAlcance(alcance);
  if (unidadId === null) return;

  const curso = await prisma.cursos.findFirst({
    where: { id: cursoId, OR: [{ unidad_id: unidadId }, { unidad_id: null }] },
    select: { id: true },
  });

  if (!curso) throw new NotFoundException('Curso no encontrado');
}

/**
 * Valida que un curso sea GESTIONABLE por el usuario.
 * Con alcance de unidad, los cursos generales (`unidad_id IS NULL`) NO son gestionables.
 */
export async function assertCursoGestionableEnAlcance(
  prisma: PrismaService,
  cursoId: bigint,
  alcance: AlcanceResuelto,
): Promise<void> {
  const unidadId = unidadIdDeAlcance(alcance);
  if (unidadId === null) return;

  const curso = await prisma.cursos.findFirst({
    where: { id: cursoId, unidad_id: unidadId },
    select: { id: true },
  });

  if (!curso) throw new NotFoundException('Curso no encontrado');
}

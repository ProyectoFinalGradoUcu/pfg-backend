import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AlcanceResuelto, subUnidadIdsDeAlcance } from './alcance.types';

/**
 * Condición sobre `relaciones_laborales` que define la relación laboral ACTIVA.
 * Misma definición que usa `subalternos.service.ts#findAllPersonas`.
 */
export const RELACION_ACTIVA = { fecha_fin: null };

/**
 * Fragmento de `where` para listados de personas.
 * Global → sin restricción. Unidad → solo personas con relación laboral activa en alguna de las bases del usuario.
 */
export function wherePersonasPorAlcance(alcance: AlcanceResuelto) {
  const subUnidadIds = subUnidadIdsDeAlcance(alcance);
  if (subUnidadIds === null) return {};
  return {
    relaciones_laborales: {
      some: { ...RELACION_ACTIVA, sub_unidad_id: { in: subUnidadIds } },
    },
  };
}

/** Curso general de la fuerza: sin base ni comando. */
const CURSO_GENERAL = { sub_unidad_id: null, unidad_id: null };

/**
 * Fragmento de `where` para listados de cursos.
 * Global → sin restricción. Unidad → cursos de sus bases MÁS los generales.
 * Un curso de comando que quedó sin base (backfill ambiguo) solo lo ve el alcance global.
 */
export function whereCursosVisiblesPorAlcance(alcance: AlcanceResuelto) {
  const subUnidadIds = subUnidadIdsDeAlcance(alcance);
  if (subUnidadIds === null) return {};
  return { OR: [{ sub_unidad_id: { in: subUnidadIds } }, CURSO_GENERAL] };
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
  const subUnidadIds = subUnidadIdsDeAlcance(alcance);
  if (subUnidadIds === null) return;

  const persona = await prisma.personas.findFirst({
    where: {
      id: personaId,
      relaciones_laborales: {
        some: { ...RELACION_ACTIVA, sub_unidad_id: { in: subUnidadIds } },
      },
    },
    select: { id: true },
  });

  if (!persona) throw new NotFoundException('Persona no encontrada');
}

/**
 * Valida que un curso sea VISIBLE para el usuario (de alguna de sus bases, o general).
 */
export async function assertCursoVisibleEnAlcance(
  prisma: PrismaService,
  cursoId: bigint,
  alcance: AlcanceResuelto,
): Promise<void> {
  const subUnidadIds = subUnidadIdsDeAlcance(alcance);
  if (subUnidadIds === null) return;

  const curso = await prisma.cursos.findFirst({
    where: {
      id: cursoId,
      OR: [{ sub_unidad_id: { in: subUnidadIds } }, CURSO_GENERAL],
    },
    select: { id: true },
  });

  if (!curso) throw new NotFoundException('Curso no encontrado');
}

/**
 * Valida que un curso sea GESTIONABLE por el usuario.
 * Con alcance de unidad solo se gestionan los cursos de sus bases; los generales NO.
 */
export async function assertCursoGestionableEnAlcance(
  prisma: PrismaService,
  cursoId: bigint,
  alcance: AlcanceResuelto,
): Promise<void> {
  const subUnidadIds = subUnidadIdsDeAlcance(alcance);
  if (subUnidadIds === null) return;

  const curso = await prisma.cursos.findFirst({
    where: { id: cursoId, sub_unidad_id: { in: subUnidadIds } },
    select: { id: true },
  });

  if (!curso) throw new NotFoundException('Curso no encontrado');
}

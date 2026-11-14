import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlcanceResuelto, subUnidadIdsDeAlcance } from '../../lib/alcance/alcance.types';
import { CursoDto } from './dto/curso.dto';

/** Regla común del catálogo, ejecutada dentro de la transacción del llamador. */
export async function crearCurso(
  tx: Prisma.TransactionClient,
  dto: CursoDto,
  alcance?: AlcanceResuelto,
) {
  const nombre = dto.nombre_curso;
  const existe = await tx.cursos.findFirst({
    where: { nombre_curso: nombre },
  });
  if (existe) {
    throw new ConflictException(`Ya existe un curso con nombre ${dto.nombre_curso}`);
  }

  const propias = alcance ? subUnidadIdsDeAlcance(alcance) : null;
  let baseId = dto.sub_unidad_id != null ? BigInt(dto.sub_unidad_id) : null;
  if (propias !== null) {
    if (baseId === null) {
      if (propias.length !== 1) throw new BadRequestException('Elegí la base del curso (sub_unidad_id)');
      baseId = propias[0];
    } else if (!propias.includes(baseId)) {
      throw new ForbiddenException('Solo podés crear cursos de tus propias bases');
    }
  }
  const base = baseId === null ? null : await tx.sub_unidades.findUnique({
    where: { id: baseId }, select: { id: true, unidad_id: true, vigente: true },
  });
  if (baseId !== null && !base) throw new BadRequestException('sub_unidad_id no existe en la tabla de sub-unidades');
  if (base && !base.vigente) throw new BadRequestException('La base elegida no está vigente');

  try { return await tx.cursos.create({
    data: {
      nombre_curso: nombre,
      institucion: dto.institucion,
      es_obligatorio: dto.es_obligatorio ?? true,
      unidad_id: base?.unidad_id ?? null,
      sub_unidad_id: base?.id ?? null,
    },
  }); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`Ya existe un curso con nombre ${nombre}`);
    }
    throw error;
  }
}

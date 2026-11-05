import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlcanceResuelto, unidadIdDeAlcance } from '../../lib/alcance/alcance.types';
import { CursoDto } from './dto/curso.dto';

/** Regla común del catálogo, ejecutada dentro de la transacción del llamador. */
export async function crearCurso(
  tx: Prisma.TransactionClient,
  dto: CursoDto,
  alcance?: AlcanceResuelto,
) {
  const existe = await tx.cursos.findFirst({
    where: { nombre_curso: dto.nombre_curso },
  });
  if (existe) {
    throw new ConflictException(`Ya existe un curso con nombre ${dto.nombre_curso}`);
  }

  return tx.cursos.create({
    data: {
      nombre_curso: dto.nombre_curso,
      institucion: dto.institucion,
      es_obligatorio: dto.es_obligatorio ?? true,
      unidad_id: alcance ? unidadIdDeAlcance(alcance) : null,
    },
  });
}

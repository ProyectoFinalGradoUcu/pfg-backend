import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlcanceResuelto, unidadIdDeAlcance } from '../../lib/alcance/alcance.types';
import { CursoDto } from './dto/curso.dto';
import { nombreCursoValido } from './validaciones';

/** Regla común del catálogo, ejecutada dentro de la transacción del llamador. */
export async function crearCurso(
  tx: Prisma.TransactionClient,
  dto: CursoDto,
  alcance?: AlcanceResuelto,
) {
  const nombre = nombreCursoValido(dto.nombre_curso);
  const existe = await tx.cursos.findFirst({
    where: { nombre_curso: { equals: nombre, mode: 'insensitive' } },
  });
  if (existe) {
    throw new ConflictException(`Ya existe un curso con nombre ${dto.nombre_curso}`);
  }

  try { return await tx.cursos.create({
    data: {
      nombre_curso: nombre,
      institucion: dto.institucion,
      es_obligatorio: dto.es_obligatorio ?? true,
      unidad_id: alcance ? unidadIdDeAlcance(alcance) : null,
    },
  }); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`Ya existe un curso con nombre ${nombre}`);
    }
    throw error;
  }
}

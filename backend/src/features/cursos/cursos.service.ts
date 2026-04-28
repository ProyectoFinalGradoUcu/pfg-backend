import {
  Injectable,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';

import { CursoDto } from './dto/curso.dto.js';

@Injectable()
export class CursosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CursoDto) {
    const existe = await this.prisma.cursos.findFirst({
      where: { nombre_curso: dto.nombre_curso },
    });
    if (existe) {
      throw new ConflictException(
        `Ya existe una curso con Nombre ${dto.nombre_curso}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const curso = await tx.cursos.create({
        data: {
          nombre_curso: dto.nombre_curso,
          institucion: dto.institucion,
          boletin: dto.boletin,
          numero_orden: dto.numero_orden,
        },
      });


      return {
        id: curso.id,
        nombre_curso: curso.nombre_curso,
        institucion: curso.institucion,
        boletin: curso.boletin,
        numero_orden: curso.numero_orden,
      };
    });
  }

  
}

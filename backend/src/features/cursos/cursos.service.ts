import {
  Injectable,
  ConflictException,
  NotFoundException,
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

  async get() {
    const cursos = await this.prisma.cursos.findMany({
      orderBy: { id: 'desc' },
    });

    return cursos.map((curso) => ({
      id: curso.id,
      nombre_curso: curso.nombre_curso,
    }));
  }

  async getById(id: number) {
    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(id) },
      include: {
        modulos_curso: {
          orderBy: { orden_modulo: 'asc' },
        },
      },
    });

    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${id}`);
    }

    return {
      id: curso.id,
      nombre_curso: curso.nombre_curso,
      institucion: curso.institucion,
      boletin: curso.boletin,
      numero_orden: curso.numero_orden,
      modulos_curso: curso.modulos_curso.map((modulo) => ({
        id: modulo.id,
        curso_id: modulo.curso_id,
        nombre_modulo: modulo.nombre_modulo,
        orden_modulo: modulo.orden_modulo,
        descripcion: modulo.descripcion,
      })),
    };
  }

  async removeCurso(id: number) {
    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(id) },
    });

    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${id}`);
    }

    await this.prisma.cursos.delete({
      where: { id: BigInt(id) },
    });

    return {
      id,
      eliminado: true,
    };
  }

  async removeModuloCurso(cursoId: number, moduloId: number) {
    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(cursoId) },
    });

    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${cursoId}`);
    }

    const modulo = await this.prisma.modulos_curso.findFirst({
      where: {
        id: BigInt(moduloId),
        curso_id: BigInt(cursoId),
      },
    });

    if (!modulo) {
      throw new NotFoundException(
        `No existe módulo con id ${moduloId} para el curso ${cursoId}`,
      );
    }

    await this.prisma.modulos_curso.delete({
      where: { id: BigInt(moduloId) },
    });

    return {
      curso_id: cursoId,
      modulo_id: moduloId,
      eliminado: true,
    };
  }
}

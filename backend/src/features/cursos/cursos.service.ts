import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { CursoDto } from './dto/curso.dto';
import { ListCursosQueryDto } from './dto/list-cursos-query.dto';
import { CreateModuloCursoDto } from './dto/create-modulo-curso.dto';
import { MarcarCompletacionDto } from './dto/completacion-modulo.dto';
import { CursosPorFuncionarioQueryDto } from './dto/cursos-por-funcionario-query.dto';

@Injectable()
export class CursosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CursoDto) {
    const existe = await this.prisma.cursos.findFirst({
      where: { nombre_curso: dto.nombre_curso },
    });
    if (existe) {
      throw new ConflictException(
        `Ya existe un curso con nombre ${dto.nombre_curso}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const curso = await tx.cursos.create({
        data: {
          nombre_curso: dto.nombre_curso,
          institucion: dto.institucion,
          boletin: dto.boletin,
          numero_orden: dto.numero_orden,
          es_obligatorio: dto.es_obligatorio ?? true,
        },
      });

      return {
        id: curso.id.toString(),
        nombre_curso: curso.nombre_curso,
        institucion: curso.institucion,
        boletin: curso.boletin,
        numero_orden: curso.numero_orden,
        es_obligatorio: curso.es_obligatorio,
      };
    });
  }

  async findAll(query: ListCursosQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);

    const [total, cursos] = await this.prisma.$transaction([
      this.prisma.cursos.count(),
      this.prisma.cursos.findMany({
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          modulos_curso: {
            orderBy: { orden_modulo: 'asc' },
          },
        },
      }),
    ]);

    return {
      items: cursos.map((c) => ({
        id: c.id.toString(),
        nombre_curso: c.nombre_curso,
        institucion: c.institucion,
        boletin: c.boletin,
        numero_orden: c.numero_orden,
        es_obligatorio: c.es_obligatorio,
        modulos_curso: c.modulos_curso.map((m) => ({
          id: m.id.toString(),
          curso_id: m.curso_id?.toString() ?? null,
          nombre_modulo: m.nombre_modulo,
          orden_modulo: m.orden_modulo,
          descripcion: m.descripcion,
        })),
      })),
      total,
      page,
      pageSize,
    };
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
      id: curso.id.toString(),
      nombre_curso: curso.nombre_curso,
      institucion: curso.institucion,
      boletin: curso.boletin,
      numero_orden: curso.numero_orden,
      es_obligatorio: curso.es_obligatorio,
      modulos_curso: curso.modulos_curso.map((m) => ({
        id: m.id.toString(),
        curso_id: m.curso_id?.toString() ?? null,
        nombre_modulo: m.nombre_modulo,
        orden_modulo: m.orden_modulo,
        descripcion: m.descripcion,
      })),
    };
  }

  async createModulo(cursoId: number, dto: CreateModuloCursoDto) {
    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(cursoId) },
    });

    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${cursoId}`);
    }

    const modulo = await this.prisma.modulos_curso.create({
      data: {
        curso_id: BigInt(cursoId),
        nombre_modulo: dto.nombre_modulo,
        orden_modulo: dto.orden_modulo,
        descripcion: dto.descripcion,
      },
    });

    return {
      id: modulo.id.toString(),
      curso_id: modulo.curso_id?.toString() ?? null,
      nombre_modulo: modulo.nombre_modulo,
      orden_modulo: modulo.orden_modulo,
      descripcion: modulo.descripcion,
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

    return { id: id.toString(), eliminado: true };
  }

  async getCursosPorFuncionario(query: CursosPorFuncionarioQueryDto) {
    const registros = await this.prisma.funcionarios_cursos.findMany({
      where: query.cedula
        ? { personas: { cedula: query.cedula } }
        : undefined,
      include: {
        personas: {
          select: {
            id: true,
            cedula: true,
            primer_nombre: true,
            segundo_nombre: true,
            primer_apellido: true,
            segundo_apellido: true,
          },
        },
        cursos: {
          select: {
            id: true,
            nombre_curso: true,
            institucion: true,
            boletin: true,
            numero_orden: true,
            es_obligatorio: true,
          },
        },
      },
      orderBy: [{ persona_id: 'asc' }, { curso_id: 'asc' }],
    });

    return registros.map((r) => ({
      persona: {
        id: r.personas.id.toString(),
        cedula: r.personas.cedula,
        primer_nombre: r.personas.primer_nombre,
        segundo_nombre: r.personas.segundo_nombre,
        primer_apellido: r.personas.primer_apellido,
        segundo_apellido: r.personas.segundo_apellido,
      },
      curso: {
        id: r.cursos.id.toString(),
        nombre_curso: r.cursos.nombre_curso,
        institucion: r.cursos.institucion,
        boletin: r.cursos.boletin,
        numero_orden: r.cursos.numero_orden,
        es_obligatorio: r.cursos.es_obligatorio,
      },
      fecha_inicio: r.fecha_inicio,
      fecha_fin: r.fecha_fin,
      calificacion: r.calificacion,
    }));
  }

  async marcarCompletacion(cursoId: number, moduloId: number, dto: MarcarCompletacionDto) {
    const modulo = await this.prisma.modulos_curso.findFirst({
      where: { id: BigInt(moduloId), curso_id: BigInt(cursoId) },
    });
    if (!modulo) {
      throw new NotFoundException(
        `No existe módulo con id ${moduloId} para el curso ${cursoId}`,
      );
    }

    const completacion = await this.prisma.funcionarios_modulos_curso.upsert({
      where: {
        persona_id_modulo_id: {
          persona_id: BigInt(dto.persona_id),
          modulo_id: BigInt(moduloId),
        },
      },
      create: {
        persona_id: BigInt(dto.persona_id),
        modulo_id: BigInt(moduloId),
        completado: dto.completado ?? false,
        fecha_finalizacion: dto.fecha_finalizacion ? new Date(dto.fecha_finalizacion) : null,
        calificacion: dto.calificacion ?? null,
      },
      update: {
        completado: dto.completado ?? false,
        fecha_finalizacion: dto.fecha_finalizacion ? new Date(dto.fecha_finalizacion) : null,
        calificacion: dto.calificacion ?? null,
      },
    });

    return {
      persona_id: completacion.persona_id.toString(),
      modulo_id: completacion.modulo_id.toString(),
      completado: completacion.completado,
      fecha_finalizacion: completacion.fecha_finalizacion,
      calificacion: completacion.calificacion,
    };
  }

  async getCompletacionesModulo(cursoId: number, moduloId: number) {
    const modulo = await this.prisma.modulos_curso.findFirst({
      where: { id: BigInt(moduloId), curso_id: BigInt(cursoId) },
    });
    if (!modulo) {
      throw new NotFoundException(
        `No existe módulo con id ${moduloId} para el curso ${cursoId}`,
      );
    }

    const completaciones = await this.prisma.funcionarios_modulos_curso.findMany({
      where: { modulo_id: BigInt(moduloId) },
      include: { personas: { select: { id: true, primer_nombre: true, primer_apellido: true } } },
    });

    return completaciones.map((c) => ({
      persona_id: c.persona_id.toString(),
      primer_nombre: c.personas.primer_nombre,
      primer_apellido: c.personas.primer_apellido,
      completado: c.completado,
      fecha_finalizacion: c.fecha_finalizacion,
      calificacion: c.calificacion,
    }));
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
      curso_id: cursoId.toString(),
      modulo_id: moduloId.toString(),
      eliminado: true,
    };
  }
}

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
import { CreateDesignacionDto } from './dto/create-designacion.dto';
import { UpdateCursoDto } from './dto/update-curso.dto';
import { UpdateDesignacionDto } from './dto/update-designacion.dto';

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
          es_obligatorio: dto.es_obligatorio ?? true,
        },
      });

      return {
        id: curso.id.toString(),
        nombre_curso: curso.nombre_curso,
        institucion: curso.institucion,
        es_obligatorio: curso.es_obligatorio,
      };
    });
  }

  async findAll(query: ListCursosQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);

    const where = {
      ...(query.institucion ? { institucion: { contains: query.institucion, mode: 'insensitive' as const } } : {}),
      ...(query.nombre ? { nombre_curso: { contains: query.nombre, mode: 'insensitive' as const } } : {}),
      ...(query.es_obligatorio !== undefined ? { es_obligatorio: query.es_obligatorio } : {}),
    };

    const [total, cursos] = await this.prisma.$transaction([
      this.prisma.cursos.count({ where }),
      this.prisma.cursos.findMany({
        where,
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

    await this.prisma.$transaction([
      // Borra inscripciones (cascada sus filas de módulo) para no violar las FK.
      this.prisma.funcionarios_cursos.deleteMany({ where: { curso_id: BigInt(id) } }),
      // Borra el curso (cascada las definiciones de módulos_curso).
      this.prisma.cursos.delete({ where: { id: BigInt(id) } }),
    ]);

    return { id: id.toString(), eliminado: true };
  }

  async getCursosPorFuncionario(query: CursosPorFuncionarioQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);
    const where = query.cedula ? { personas: { cedula: query.cedula } } : undefined;

    const [total, registros] = await this.prisma.$transaction([
      this.prisma.funcionarios_cursos.count({ where }),
      this.prisma.funcionarios_cursos.findMany({
        where,
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
              es_obligatorio: true,
            },
          },
          modulos: {
            include: {
              modulos_curso: {
                select: { id: true, nombre_modulo: true, orden_modulo: true },
              },
            },
          },
        },
        orderBy: [{ persona_id: 'asc' }, { curso_id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: registros.map((r) => ({
      id: r.id.toString(),
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
        es_obligatorio: r.cursos.es_obligatorio,
      },
      numero_orden: r.numero_orden,
      boletin: r.boletin,
      fecha_inicio: r.fecha_inicio,
      fecha_fin: r.fecha_fin,
      calificacion: r.calificacion !== null && r.calificacion !== undefined ? Number(r.calificacion) : null,
      modulos: r.modulos.map((m) => ({
        id: m.id.toString(),
        modulo_id: m.modulo_id.toString(),
        nombre_modulo: m.modulos_curso.nombre_modulo,
        orden_modulo: m.modulos_curso.orden_modulo,
        numero_orden: m.numero_orden,
        boletin: m.boletin,
        completado: m.completado,
        fecha_finalizacion: m.fecha_finalizacion,
        calificacion: m.calificacion !== null && m.calificacion !== undefined ? Number(m.calificacion) : null,
      })),
    })),
      total,
      page,
      pageSize,
    };
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

    const completacion = await this.prisma.$transaction(async (tx) => {
      // 1) Asegurar la inscripción al curso (padre). Si no existe, se crea.
      const inscripcion = await tx.funcionarios_cursos.upsert({
        where: {
          persona_id_curso_id: {
            persona_id: BigInt(dto.persona_id),
            curso_id: BigInt(cursoId),
          },
        },
        create: {
          persona_id: BigInt(dto.persona_id),
          curso_id: BigInt(cursoId),
        },
        update: {},
      });

      // 2) Marcar/actualizar el detalle del módulo (hijo) con su orden/boletín.
      return tx.funcionarios_modulos_curso.upsert({
        where: {
          funcionario_curso_id_modulo_id: {
            funcionario_curso_id: inscripcion.id,
            modulo_id: BigInt(moduloId),
          },
        },
        create: {
          funcionario_curso_id: inscripcion.id,
          modulo_id: BigInt(moduloId),
          completado: dto.completado ?? false,
          fecha_finalizacion: dto.fecha_finalizacion ? new Date(dto.fecha_finalizacion) : null,
          calificacion: dto.calificacion ?? null,
          numero_orden: dto.numero_orden ?? null,
          boletin: dto.boletin ?? null,
        },
        update: {
          completado: dto.completado ?? false,
          fecha_finalizacion: dto.fecha_finalizacion ? new Date(dto.fecha_finalizacion) : null,
          calificacion: dto.calificacion ?? null,
          numero_orden: dto.numero_orden ?? null,
          boletin: dto.boletin ?? null,
        },
      });
    });

    return {
      id: completacion.id.toString(),
      funcionario_curso_id: completacion.funcionario_curso_id.toString(),
      modulo_id: completacion.modulo_id.toString(),
      completado: completacion.completado,
      fecha_finalizacion: completacion.fecha_finalizacion,
      calificacion: completacion.calificacion,
      numero_orden: completacion.numero_orden,
      boletin: completacion.boletin,
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
      include: {
        funcionarios_cursos: {
          include: {
            personas: { select: { id: true, primer_nombre: true, primer_apellido: true } },
          },
        },
      },
    });

    return completaciones.map((c) => ({
      persona_id: c.funcionarios_cursos.personas.id.toString(),
      primer_nombre: c.funcionarios_cursos.personas.primer_nombre,
      primer_apellido: c.funcionarios_cursos.personas.primer_apellido,
      completado: c.completado,
      fecha_finalizacion: c.fecha_finalizacion,
      calificacion: c.calificacion,
      numero_orden: c.numero_orden,
      boletin: c.boletin,
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

    // Borrar primero las participaciones del módulo (no hay cascade en esa FK).
    await this.prisma.$transaction([
      this.prisma.funcionarios_modulos_curso.deleteMany({
        where: { modulo_id: BigInt(moduloId) },
      }),
      this.prisma.modulos_curso.delete({
        where: { id: BigInt(moduloId) },
      }),
    ]);

    return {
      curso_id: cursoId.toString(),
      modulo_id: moduloId.toString(),
      eliminado: true,
    };
  }

  // ─── Editar curso ─────────────────────────────────────────────────────────
  async editarCurso(id: number, dto: UpdateCursoDto) {
    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(id) },
    });
    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${id}`);
    }

    if (dto.nombre_curso && dto.nombre_curso !== curso.nombre_curso) {
      const dup = await this.prisma.cursos.findFirst({
        where: { nombre_curso: dto.nombre_curso, id: { not: BigInt(id) } },
      });
      if (dup) {
        throw new ConflictException(
          `Ya existe un curso con nombre ${dto.nombre_curso}`,
        );
      }
    }

    const actualizado = await this.prisma.cursos.update({
      where: { id: BigInt(id) },
      data: {
        nombre_curso: dto.nombre_curso ?? undefined,
        institucion: dto.institucion ?? undefined,
        es_obligatorio: dto.es_obligatorio ?? undefined,
      },
    });

    return {
      id: actualizado.id.toString(),
      nombre_curso: actualizado.nombre_curso,
      institucion: actualizado.institucion,
      es_obligatorio: actualizado.es_obligatorio,
    };
  }

  // ─── Designar / Dictar (crear una instancia) ──────────────────────────────
  async crearDesignacion(cursoId: number, dto: CreateDesignacionDto) {
    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(cursoId) },
    });
    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${cursoId}`);
    }

    const moduloIds = dto.modulo_ids ?? [];
    if (moduloIds.length) {
      const count = await this.prisma.modulos_curso.count({
        where: {
          id: { in: moduloIds.map((m) => BigInt(m)) },
          curso_id: BigInt(cursoId),
        },
      });
      if (count !== moduloIds.length) {
        throw new NotFoundException(
          'Uno o más módulos no pertenecen a este curso',
        );
      }
    }

    const fechaInicio = new Date(dto.fecha_inicio);
    const fechaFin = new Date(dto.fecha_fin);
    const aNivelModulo = moduloIds.length > 0;

    await this.prisma.$transaction(async (tx) => {
      for (const personaId of dto.persona_ids) {
        const inscripcion = await tx.funcionarios_cursos.upsert({
          where: {
            persona_id_curso_id: {
              persona_id: BigInt(personaId),
              curso_id: BigInt(cursoId),
            },
          },
          create: {
            persona_id: BigInt(personaId),
            curso_id: BigInt(cursoId),
            // A nivel módulo, la orden/boletín van en las filas de módulo.
            numero_orden: aNivelModulo ? null : (dto.numero_orden ?? null),
            boletin: aNivelModulo ? null : (dto.boletin ?? null),
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
          },
          update: {
            ...(aNivelModulo
              ? {}
              : { numero_orden: dto.numero_orden ?? null, boletin: dto.boletin ?? null }),
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
          },
        });

        for (const moduloId of moduloIds) {
          await tx.funcionarios_modulos_curso.upsert({
            where: {
              funcionario_curso_id_modulo_id: {
                funcionario_curso_id: inscripcion.id,
                modulo_id: BigInt(moduloId),
              },
            },
            create: {
              funcionario_curso_id: inscripcion.id,
              modulo_id: BigInt(moduloId),
              numero_orden: dto.numero_orden ?? null,
              boletin: dto.boletin ?? null,
              completado: false,
              fecha_finalizacion: null,
            },
            update: {
              numero_orden: dto.numero_orden ?? null,
              boletin: dto.boletin ?? null,
            },
          });
        }
      }
    });

    return {
      curso_id: cursoId.toString(),
      personas_designadas: dto.persona_ids.length,
      modulos_designados: moduloIds.length,
      numero_orden: dto.numero_orden ?? null,
      boletin: dto.boletin ?? null,
    };
  }

  async actualizarDesignacion(cursoId: number, designacionId: number, dto: UpdateDesignacionDto) {
    const designacion = await this.prisma.funcionarios_cursos.findFirst({
      where: { id: BigInt(designacionId), curso_id: BigInt(cursoId) },
    });
    if (!designacion) {
      throw new NotFoundException(
        `No existe designación con id ${designacionId} para el curso ${cursoId}`,
      );
    }

    const actualizado = await this.prisma.funcionarios_cursos.update({
      where: { id: BigInt(designacionId) },
      data: {
        calificacion: dto.calificacion.toString(),
      },
    });

    return {
      id: actualizado.id.toString(),
      curso_id: actualizado.curso_id.toString(),
      persona_id: actualizado.persona_id.toString(),
      calificacion: Number(actualizado.calificacion),
    };
  }

}

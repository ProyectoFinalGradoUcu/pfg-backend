import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import {
  AlcanceResuelto,
  unidadIdDeAlcance,
} from '../../lib/alcance/alcance.types';
import {
  assertPersonaEnAlcance,
  wherePersonasPorAlcance,
} from '../../lib/alcance/alcance.where';
import { CreateHistorialCursoDto } from './dto/create-historial-curso.dto';
import { ListHistorialCursosQueryDto } from './dto/list-historial-cursos-query.dto';

@Injectable()
export class HistorialCursosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListHistorialCursosQueryDto, alcance?: AlcanceResuelto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);

    // El historial es un dato del funcionario, asi que se segmenta por la unidad de la PERSONA
    // y no por la del curso, aunque el endpoint este protegido por permisos de cursos.
    const where =
      alcance && unidadIdDeAlcance(alcance) !== null
        ? { personas: wherePersonasPorAlcance(alcance) }
        : {};

    const [total, registros] = await this.prisma.$transaction([
      this.prisma.funcionarios_cursos.count({ where }),
      this.prisma.funcionarios_cursos.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          personas: {
            select: { id: true, primer_nombre: true, primer_apellido: true },
          },
          cursos: {
            select: { id: true, nombre_curso: true, institucion: true, es_obligatorio: true },
          },
        },
      }),
    ]);

    return {
      items: registros.map((r) => this.mapRow(r)),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateHistorialCursoDto, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertPersonaEnAlcance(this.prisma, BigInt(dto.personaId), alcance);
    }

    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(dto.personaId) },
    });
    if (!persona) {
      throw new NotFoundException(`No existe persona con id ${dto.personaId}`);
    }

    const registro = await this.prisma.$transaction(async (tx) => {
      const curso = await tx.cursos.create({
        data: {
          nombre_curso: dto.nombre,
          institucion: dto.institucion,
          es_obligatorio: dto.tipo === 'obligatorio',
        },
      });

      const designacion = await tx.funcionarios_cursos.create({
        data: {
          persona_id: BigInt(dto.personaId),
          curso_id: curso.id,
          fecha_inicio: dto.fechaInicio ? new Date(dto.fechaInicio) : null,
          fecha_fin: dto.fechaFin ? new Date(dto.fechaFin) : null,
        },
        include: {
          personas: {
            select: { id: true, primer_nombre: true, primer_apellido: true },
          },
          cursos: {
            select: { id: true, nombre_curso: true, institucion: true, es_obligatorio: true },
          },
        },
      });

      return designacion;
    });

    return this.mapRow(registro);
  }

  private mapRow(r: any) {
    return {
      id: r.id.toString(),
      persona: {
        id: r.personas.id.toString(),
        nombre: `${r.personas.primer_nombre ?? ''} ${r.personas.primer_apellido ?? ''}`.trim(),
      },
      nombre: r.cursos.nombre_curso,
      institucion: r.cursos.institucion,
      tipo: r.cursos.es_obligatorio ? 'obligatorio' : 'optativo',
      fechaInicio: r.fecha_inicio,
      fechaFin: r.fecha_fin,
      documentoUrl: null,
    };
  }
}

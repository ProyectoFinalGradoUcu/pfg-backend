import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { CreateMisionDto } from './dto/create-mision.dto';
import { UpdateMisionDto } from './dto/update-mision.dto';
import { ListMisionesQueryDto } from './dto/list-misiones-query.dto';
import { CreateConvocatoriaDto } from './dto/create-convocatoria.dto';
import { UpdateConvocatoriaDto } from './dto/update-convocatoria.dto';
import { ListConvocatoriasQueryDto } from './dto/list-convocatorias-query.dto';
import { AddFuncionariosConvocatoriaDto, FuncionarioConvocatoriaItemDto } from './dto/add-funcionarios-convocatoria.dto';
import { UpdateFuncionarioConvocatoriaDto } from './dto/update-funcionario-convocatoria.dto';
import { ListFuncionariosConvocatoriaQueryDto } from './dto/list-funcionarios-convocatoria-query.dto';
import { ListPersonalMisionQueryDto } from './dto/list-personal-mision-query.dto';

// Computed: una convocatoria está finalizada cuando tiene fecha de llegada y ya pasó
const esFinalizada = (fechaLlegada: Date | null) =>
  fechaLlegada !== null && fechaLlegada <= new Date();

@Injectable()
export class MisionesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Misiones (catálogo) ────────────────────────────────────────────────────

  async listarMisiones(query: ListMisionesQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);
    const now = new Date();

    const where: any = {
      ...(query.nombre
        ? { nombre_mision: { contains: query.nombre, mode: 'insensitive' as const } }
        : {}),
      ...(query.pais
        ? { pais: { contains: query.pais, mode: 'insensitive' as const } }
        : {}),
    };

    const [total, misiones, convocatoriasActivas, personalDesplegado] =
      await this.prisma.$transaction([
        this.prisma.misiones.count({ where }),
        this.prisma.misiones.findMany({
          where,
          orderBy: { nombre_mision: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            _count: { select: { convocatorias: true } },
          },
        }),
        this.prisma.convocatorias.count({
          where: {
            OR: [{ fecha_llegada: null }, { fecha_llegada: { gt: now } }],
          },
        }),
        this.prisma.funcionarios_convocatorias.findMany({
          where: {
            convocatorias: {
              OR: [{ fecha_llegada: null }, { fecha_llegada: { gt: now } }],
            },
          },
          select: { persona_id: true },
          distinct: ['persona_id'],
        }),
      ]);

    return {
      items: misiones.map((m) => ({
        id: m.id.toString(),
        nombre_mision: m.nombre_mision,
        pais: m.pais,
        total_convocatorias: m._count.convocatorias,
      })),
      total,
      page,
      pageSize,
      stats: {
        total_misiones: total,
        convocatorias_activas: convocatoriasActivas,
        personal_desplegado: personalDesplegado.length,
      },
    };
  }

  async obtenerMision(misionId: number) {
    const mision = await this.prisma.misiones.findUnique({
      where: { id: BigInt(misionId) },
      include: { _count: { select: { convocatorias: true } } },
    });
    if (!mision) throw new NotFoundException(`No existe misión con id ${misionId}`);

    return {
      id: mision.id.toString(),
      nombre_mision: mision.nombre_mision,
      pais: mision.pais,
      total_convocatorias: mision._count.convocatorias,
    };
  }

  async crearMision(dto: CreateMisionDto) {
    const existe = await this.prisma.misiones.findFirst({
      where: { nombre_mision: { equals: dto.nombre_mision, mode: 'insensitive' } },
    });
    if (existe) throw new ConflictException(`Ya existe una misión con nombre "${dto.nombre_mision}"`);

    const mision = await this.prisma.misiones.create({
      data: { nombre_mision: dto.nombre_mision, pais: dto.pais },
    });

    return { id: mision.id.toString(), nombre_mision: mision.nombre_mision, pais: mision.pais };
  }

  async editarMision(misionId: number, dto: UpdateMisionDto) {
    const mision = await this.prisma.misiones.findUnique({ where: { id: BigInt(misionId) } });
    if (!mision) throw new NotFoundException(`No existe misión con id ${misionId}`);

    if (dto.nombre_mision && dto.nombre_mision !== mision.nombre_mision) {
      const dup = await this.prisma.misiones.findFirst({
        where: {
          nombre_mision: { equals: dto.nombre_mision, mode: 'insensitive' },
          id: { not: BigInt(misionId) },
        },
      });
      if (dup) throw new ConflictException(`Ya existe una misión con nombre "${dto.nombre_mision}"`);
    }

    const actualizado = await this.prisma.misiones.update({
      where: { id: BigInt(misionId) },
      data: {
        nombre_mision: dto.nombre_mision ?? undefined,
        pais: dto.pais ?? undefined,
      },
    });

    return {
      id: actualizado.id.toString(),
      nombre_mision: actualizado.nombre_mision,
      pais: actualizado.pais,
    };
  }

  async eliminarMision(misionId: number) {
    const mision = await this.prisma.misiones.findUnique({ where: { id: BigInt(misionId) } });
    if (!mision) throw new NotFoundException(`No existe misión con id ${misionId}`);

    // La cascada ON DELETE CASCADE en DB elimina convocatorias y funcionarios_convocatorias.
    await this.prisma.misiones.delete({ where: { id: BigInt(misionId) } });

    return { id: misionId.toString(), eliminado: true };
  }

  // ─── Convocatorias ──────────────────────────────────────────────────────────

  private mapConvocatoria(c: any): object {
    const finalizada = esFinalizada(c.fecha_llegada);
    return {
      id: c.id.toString(),
      mision_id: c.mision_id.toString(),
      numero_orden: c.numero_orden,
      boletin: c.boletin,
      fecha_salida: c.fecha_salida ? c.fecha_salida.toISOString().split('T')[0] : null,
      fecha_llegada: c.fecha_llegada ? c.fecha_llegada.toISOString().split('T')[0] : null,
      observaciones: c.observaciones,
      total_funcionarios: c._count?.funcionarios ?? 0,
      finalizada,
    };
  }

  async listarConvocatorias(misionId: number, query: ListConvocatoriasQueryDto = {}) {
    const mision = await this.prisma.misiones.findUnique({ where: { id: BigInt(misionId) } });
    if (!mision) throw new NotFoundException(`No existe misión con id ${misionId}`);

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);
    const now = new Date();

    const where: any = { mision_id: BigInt(misionId) };

    if (query.query) {
      where.OR = [
        { numero_orden: { contains: query.query, mode: 'insensitive' } },
        { boletin: { contains: query.query, mode: 'insensitive' } },
      ];
    }

    if (query.finalizada === true) {
      where.fecha_llegada = { not: null, lt: now };
    } else if (query.finalizada === false) {
      where.OR = [
        ...(where.OR ?? []),
        { fecha_llegada: null },
        { fecha_llegada: { gte: now } },
      ];
      if (!query.query) {
        where.OR = [{ fecha_llegada: null }, { fecha_llegada: { gte: now } }];
      }
    }

    const [total, convocatorias] = await this.prisma.$transaction([
      this.prisma.convocatorias.count({ where }),
      this.prisma.convocatorias.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { funcionarios: true } } },
      }),
    ]);

    return {
      items: convocatorias.map((c) => this.mapConvocatoria(c)),
      total,
      page,
      pageSize,
    };
  }

  async obtenerConvocatoria(misionId: number, convocatoriaId: number) {
    const conv = await this.prisma.convocatorias.findFirst({
      where: { id: BigInt(convocatoriaId), mision_id: BigInt(misionId) },
      include: { _count: { select: { funcionarios: true } } },
    });
    if (!conv) {
      throw new NotFoundException(
        `No existe convocatoria ${convocatoriaId} para la misión ${misionId}`,
      );
    }
    return this.mapConvocatoria(conv);
  }

  async crearConvocatoria(misionId: number, dto: CreateConvocatoriaDto) {
    const mision = await this.prisma.misiones.findUnique({ where: { id: BigInt(misionId) } });
    if (!mision) throw new NotFoundException(`No existe misión con id ${misionId}`);

    if (!dto.numero_orden && !dto.boletin) {
      throw new BadRequestException('Se requiere al menos número de orden o boletín');
    }

    const conv = await this.prisma.$transaction(async (tx) => {
      const nueva = await tx.convocatorias.create({
        data: {
          mision_id: BigInt(misionId),
          numero_orden: dto.numero_orden ?? null,
          boletin: dto.boletin ?? null,
          fecha_salida: dto.fecha_salida ? new Date(dto.fecha_salida) : null,
          fecha_llegada: dto.fecha_llegada ? new Date(dto.fecha_llegada) : null,
          observaciones: dto.observaciones ?? null,
        },
      });

      if (dto.persona_ids?.length) {
        await tx.funcionarios_convocatorias.createMany({
          data: dto.persona_ids.map((pid) => ({
            convocatoria_id: nueva.id,
            persona_id: BigInt(pid),
            numero_orden: dto.numero_orden ?? null,
            boletin: dto.boletin ?? null,
          })),
          skipDuplicates: true,
        });
      }

      return nueva;
    });

    return {
      id: conv.id.toString(),
      mision_id: conv.mision_id.toString(),
      numero_orden: conv.numero_orden,
      boletin: conv.boletin,
      fecha_salida: conv.fecha_salida ? conv.fecha_salida.toISOString().split('T')[0] : null,
      fecha_llegada: conv.fecha_llegada ? conv.fecha_llegada.toISOString().split('T')[0] : null,
      observaciones: conv.observaciones,
      finalizada: esFinalizada(conv.fecha_llegada),
    };
  }

  async editarConvocatoria(misionId: number, convocatoriaId: number, dto: UpdateConvocatoriaDto) {
    const conv = await this.prisma.convocatorias.findFirst({
      where: { id: BigInt(convocatoriaId), mision_id: BigInt(misionId) },
    });
    if (!conv) {
      throw new NotFoundException(
        `No existe convocatoria ${convocatoriaId} para la misión ${misionId}`,
      );
    }

    const ordenFinal = dto.numero_orden !== undefined ? dto.numero_orden : conv.numero_orden;
    const boletinFinal = dto.boletin !== undefined ? dto.boletin : conv.boletin;
    if (!ordenFinal && !boletinFinal) {
      throw new BadRequestException('La convocatoria debe conservar al menos número de orden o boletín');
    }

    const actualizado = await this.prisma.convocatorias.update({
      where: { id: BigInt(convocatoriaId) },
      data: {
        numero_orden: dto.numero_orden ?? undefined,
        boletin: dto.boletin ?? undefined,
        fecha_salida: dto.fecha_salida ? new Date(dto.fecha_salida) : undefined,
        fecha_llegada: dto.fecha_llegada ? new Date(dto.fecha_llegada) : undefined,
        observaciones: dto.observaciones ?? undefined,
      },
    });

    return {
      id: actualizado.id.toString(),
      mision_id: actualizado.mision_id.toString(),
      numero_orden: actualizado.numero_orden,
      boletin: actualizado.boletin,
      fecha_salida: actualizado.fecha_salida ? actualizado.fecha_salida.toISOString().split('T')[0] : null,
      fecha_llegada: actualizado.fecha_llegada ? actualizado.fecha_llegada.toISOString().split('T')[0] : null,
      observaciones: actualizado.observaciones,
      finalizada: esFinalizada(actualizado.fecha_llegada),
    };
  }

  async eliminarConvocatoria(misionId: number, convocatoriaId: number) {
    const conv = await this.prisma.convocatorias.findFirst({
      where: { id: BigInt(convocatoriaId), mision_id: BigInt(misionId) },
    });
    if (!conv) {
      throw new NotFoundException(
        `No existe convocatoria ${convocatoriaId} para la misión ${misionId}`,
      );
    }

    // ON DELETE CASCADE elimina los funcionarios_convocatorias automáticamente.
    await this.prisma.convocatorias.delete({ where: { id: BigInt(convocatoriaId) } });

    return { id: convocatoriaId.toString(), eliminado: true };
  }

  // ─── Funcionarios de una convocatoria ──────────────────────────────────────

  async listarFuncionariosConvocatoria(
    misionId: number,
    convocatoriaId: number,
    query: ListFuncionariosConvocatoriaQueryDto = {},
  ) {
    const conv = await this.prisma.convocatorias.findFirst({
      where: { id: BigInt(convocatoriaId), mision_id: BigInt(misionId) },
    });
    if (!conv) {
      throw new NotFoundException(
        `No existe convocatoria ${convocatoriaId} para la misión ${misionId}`,
      );
    }

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);

    const where: any = { convocatoria_id: BigInt(convocatoriaId) };
    if (query.query) {
      where.personas = {
        OR: [
          { cedula: { contains: query.query, mode: 'insensitive' } },
          { primer_nombre: { contains: query.query, mode: 'insensitive' } },
          { primer_apellido: { contains: query.query, mode: 'insensitive' } },
        ],
      };
    }

    const [total, asignaciones] = await this.prisma.$transaction([
      this.prisma.funcionarios_convocatorias.count({ where }),
      this.prisma.funcionarios_convocatorias.findMany({
        where,
        orderBy: [{ personas: { primer_apellido: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          personas: {
            select: {
              id: true,
              cedula: true,
              primer_nombre: true,
              primer_apellido: true,
            },
          },
        },
      }),
    ]);

    return {
      items: asignaciones.map((a) => ({
        id: a.id.toString(),
        persona_id: a.persona_id.toString(),
        cedula: a.personas.cedula,
        primer_nombre: a.personas.primer_nombre,
        primer_apellido: a.personas.primer_apellido,
        numero_orden: a.numero_orden,
        boletin: a.boletin,
        observaciones: a.observaciones,
      })),
      total,
      page,
      pageSize,
    };
  }

  async agregarFuncionarios(
    misionId: number,
    convocatoriaId: number,
    dto: AddFuncionariosConvocatoriaDto,
  ) {
    const conv = await this.prisma.convocatorias.findFirst({
      where: { id: BigInt(convocatoriaId), mision_id: BigInt(misionId) },
    });
    if (!conv) {
      throw new NotFoundException(
        `No existe convocatoria ${convocatoriaId} para la misión ${misionId}`,
      );
    }

    const personaIds = dto.funcionarios.map((f) => BigInt(f.persona_id));
    const existentes = await this.prisma.personas.findMany({
      where: { id: { in: personaIds } },
      select: { id: true },
    });
    if (existentes.length !== personaIds.length) {
      throw new BadRequestException('Una o más personas no existen en el sistema');
    }

    // Verificar duplicados
    const yaAsignados = await this.prisma.funcionarios_convocatorias.findMany({
      where: {
        convocatoria_id: BigInt(convocatoriaId),
        persona_id: { in: personaIds },
      },
      select: { persona_id: true },
    });
    if (yaAsignados.length > 0) {
      const ids = yaAsignados.map((a) => a.persona_id.toString()).join(', ');
      throw new ConflictException(
        `Los siguientes funcionarios ya están asignados a esta convocatoria: ${ids}`,
      );
    }

    await this.prisma.funcionarios_convocatorias.createMany({
      data: dto.funcionarios.map((f) => ({
        convocatoria_id: BigInt(convocatoriaId),
        persona_id: BigInt(f.persona_id),
        numero_orden: f.numero_orden ?? null,
        boletin: f.boletin ?? null,
        observaciones: f.observaciones ?? null,
      })),
    });

    return { convocatoria_id: convocatoriaId.toString(), agregados: dto.funcionarios.length };
  }

  async editarFuncionarioConvocatoria(
    misionId: number,
    convocatoriaId: number,
    personaId: number,
    dto: UpdateFuncionarioConvocatoriaDto,
  ) {
    const asignacion = await this.prisma.funcionarios_convocatorias.findFirst({
      where: {
        convocatoria_id: BigInt(convocatoriaId),
        persona_id: BigInt(personaId),
        convocatorias: { mision_id: BigInt(misionId) },
      },
    });
    if (!asignacion) {
      throw new NotFoundException(
        `Funcionario ${personaId} no está asignado a la convocatoria ${convocatoriaId}`,
      );
    }

    const ordenFinal = dto.numero_orden !== undefined ? dto.numero_orden : asignacion.numero_orden;
    const boletinFinal = dto.boletin !== undefined ? dto.boletin : asignacion.boletin;
    if (!ordenFinal && !boletinFinal) {
      throw new BadRequestException('La asignación debe conservar al menos número de orden o boletín');
    }

    const actualizado = await this.prisma.funcionarios_convocatorias.update({
      where: { id: asignacion.id },
      data: {
        numero_orden: dto.numero_orden ?? undefined,
        boletin: dto.boletin ?? undefined,
        observaciones: dto.observaciones ?? undefined,
      },
    });

    return {
      id: actualizado.id.toString(),
      persona_id: actualizado.persona_id.toString(),
      numero_orden: actualizado.numero_orden,
      boletin: actualizado.boletin,
      observaciones: actualizado.observaciones,
    };
  }

  async quitarFuncionario(misionId: number, convocatoriaId: number, personaId: number) {
    const asignacion = await this.prisma.funcionarios_convocatorias.findFirst({
      where: {
        convocatoria_id: BigInt(convocatoriaId),
        persona_id: BigInt(personaId),
        convocatorias: { mision_id: BigInt(misionId) },
      },
    });
    if (!asignacion) {
      throw new NotFoundException(
        `Funcionario ${personaId} no está asignado a la convocatoria ${convocatoriaId}`,
      );
    }

    await this.prisma.funcionarios_convocatorias.delete({ where: { id: asignacion.id } });

    return { eliminado: true };
  }

  async quitarTodosFuncionarios(misionId: number, convocatoriaId: number) {
    const conv = await this.prisma.convocatorias.findFirst({
      where: { id: BigInt(convocatoriaId), mision_id: BigInt(misionId) },
    });
    if (!conv) {
      throw new NotFoundException(
        `No existe convocatoria ${convocatoriaId} para la misión ${misionId}`,
      );
    }

    const { count } = await this.prisma.funcionarios_convocatorias.deleteMany({
      where: { convocatoria_id: BigInt(convocatoriaId) },
    });

    return { eliminados: count };
  }

  // ─── Personal en misión (listado plano global) ──────────────────────────────

  async listarPersonalEnMision(query: ListPersonalMisionQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 200, 200);

    const [total, asignaciones] = await this.prisma.$transaction([
      this.prisma.funcionarios_convocatorias.count(),
      this.prisma.funcionarios_convocatorias.findMany({
        orderBy: [{ convocatorias: { misiones: { nombre_mision: 'asc' } } }, { personas: { primer_apellido: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          personas: {
            select: {
              id: true,
              cedula: true,
              primer_nombre: true,
              primer_apellido: true,
            },
          },
          convocatorias: {
            include: {
              misiones: {
                select: { id: true, nombre_mision: true, pais: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      items: asignaciones.map((a) => ({
        id: a.id.toString(),
        persona: {
          id: a.personas.id.toString(),
          cedula: a.personas.cedula,
          primer_nombre: a.personas.primer_nombre,
          primer_apellido: a.personas.primer_apellido,
        },
        mision: {
          id: a.convocatorias.misiones.id.toString(),
          nombre_mision: a.convocatorias.misiones.nombre_mision,
          pais: a.convocatorias.misiones.pais,
        },
        convocatoria_id: a.convocatoria_id.toString(),
        numero_orden: a.numero_orden,
        boletin: a.boletin,
        fecha_salida: a.convocatorias.fecha_salida
          ? a.convocatorias.fecha_salida.toISOString().split('T')[0]
          : null,
        fecha_llegada: a.convocatorias.fecha_llegada
          ? a.convocatorias.fecha_llegada.toISOString().split('T')[0]
          : null,
        finalizada: esFinalizada(a.convocatorias.fecha_llegada),
      })),
      total,
      page,
      pageSize,
    };
  }
}

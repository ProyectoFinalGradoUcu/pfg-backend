import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { CreateMisionDto } from './dto/create-mision.dto';
import { UpdateMisionDto } from './dto/update-mision.dto';

@Injectable()
export class MisionesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMisionDto) {
    const { funcionarios_misiones, ...misionData } = dto;

    const misionDataParsed = {
      ...misionData,
      fecha_salida: misionData.fecha_salida ? new Date(misionData.fecha_salida) : undefined,
      fecha_llegada: misionData.fecha_llegada ? new Date(misionData.fecha_llegada) : undefined,
    };

    const mision = await this.prisma.$transaction(async (tx) => {
      if (funcionarios_misiones && funcionarios_misiones.length > 0) {
        const personasIds = funcionarios_misiones.map((f) => BigInt(f.persona_id));
        const personasExistentes = await tx.personas.findMany({
          where: { id: { in: personasIds } },
          select: { id: true },
        });

        if (personasExistentes.length !== personasIds.length) {
          throw new BadRequestException('Uno o más funcionarios no existen');
        }
      }

      const misionCreada = await tx.misiones.create({ data: misionDataParsed });

      if (funcionarios_misiones && funcionarios_misiones.length > 0) {
        await tx.funcionarios_misiones.createMany({
          data: funcionarios_misiones.map((f) => ({
            mision_id: misionCreada.id,
            persona_id: BigInt(f.persona_id),
            boletin: f.boletin,
            observaciones: f.observaciones,
            numero_control_migratorio: f.numero_control_migratorio,
          })),
          skipDuplicates: true,
        });
      }

      return misionCreada;
    });

    return { id: mision.id.toString() };
  }

  async findOne(id: string) {
    const mision = await this.prisma.misiones.findUnique({
      where: { id: BigInt(id) },
      include: {
        funcionarios_misiones: {
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
        },
      },
    });
    if (!mision) throw new NotFoundException('Misión no encontrada');
    return {
      id: mision.id.toString(),
      pais: mision.pais,
      tipo_mision: mision.tipo_mision,
      fecha_salida: mision.fecha_salida ? mision.fecha_salida.toISOString().split('T')[0] : null,
      fecha_llegada: mision.fecha_llegada ? mision.fecha_llegada.toISOString().split('T')[0] : null,
      numero_orden: mision.numero_orden,
      boletin: mision.boletin,
      observaciones: mision.observaciones,
      comando_responsable: mision.comando_responsable,
      funcionarios: mision.funcionarios_misiones.map((f) => ({
        persona_id: f.persona_id.toString(),
        persona: f.personas
          ? {
              id: f.personas.id.toString(),
              cedula: f.personas.cedula,
              nombre: `${f.personas.primer_nombre} ${f.personas.primer_apellido}`.trim(),
            }
          : null,
        boletin: f.boletin,
        observaciones: f.observaciones,
        numero_control_migratorio: f.numero_control_migratorio,
      })),
    };
  }

  async update(id: string, dto: UpdateMisionDto) {
    const mision = await this.prisma.misiones.findUnique({ where: { id: BigInt(id) } });
    if (!mision) throw new NotFoundException('Misión no encontrada');

    const { funcionarios_misiones, ...misionData } = dto;

    await this.prisma.$transaction(async (tx) => {
      await tx.misiones.update({
        where: { id: BigInt(id) },
        data: {
          ...misionData,
          fecha_salida: misionData.fecha_salida ? new Date(misionData.fecha_salida) : undefined,
          fecha_llegada: misionData.fecha_llegada ? new Date(misionData.fecha_llegada) : undefined,
        },
      });

      if (funcionarios_misiones !== undefined) {
        if (funcionarios_misiones.length > 0) {
          const personasIds = funcionarios_misiones.map((f) => BigInt(f.persona_id));
          const personasExistentes = await tx.personas.findMany({
            where: { id: { in: personasIds } },
            select: { id: true },
          });
          if (personasExistentes.length !== personasIds.length) {
            throw new BadRequestException('Uno o más funcionarios no existen');
          }
        }

        await tx.funcionarios_misiones.deleteMany({ where: { mision_id: BigInt(id) } });

        if (funcionarios_misiones.length > 0) {
          await tx.funcionarios_misiones.createMany({
            data: funcionarios_misiones.map((f) => ({
              mision_id: BigInt(id),
              persona_id: BigInt(f.persona_id),
              boletin: f.boletin,
              observaciones: f.observaciones,
              numero_control_migratorio: f.numero_control_migratorio,
            })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const mision = await this.prisma.misiones.findUnique({ where: { id: BigInt(id) } });
    if (!mision) throw new NotFoundException('Misión no encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.funcionarios_misiones.deleteMany({ where: { mision_id: BigInt(id) } });
      await tx.misiones.delete({ where: { id: BigInt(id) } });
    });

    return null;
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const take = limit;
    const now = new Date();

    // 1. Obtener la data paginada
    const misiones = await this.prisma.misiones.findMany({
      skip,
      take,
      orderBy: { fecha_salida: 'desc' },
      include: {
        _count: { select: { funcionarios_misiones: true } },
      },
    });

    // 2. Calcular los totales para las estadísticas
    const [total, activas, finalizadas] = await Promise.all([
      this.prisma.misiones.count(),
      this.prisma.misiones.count({
        where: {
          fecha_salida: { lte: now },
          OR: [{ fecha_llegada: null }, { fecha_llegada: { gte: now } }],
        },
      }),
      this.prisma.misiones.count({
        where: { fecha_llegada: { lt: now } },
      }),
    ]);

    return {
      data: misiones.map((m) => ({
        id: m.id.toString(),
        pais: m.pais,
        tipo_mision: m.tipo_mision,
        fecha_salida: m.fecha_salida ? m.fecha_salida.toISOString().split('T')[0] : null,
        fecha_llegada: m.fecha_llegada ? m.fecha_llegada.toISOString().split('T')[0] : null,
        numero_orden: m.numero_orden,
        boletin: m.boletin,
        comando_responsable: m.comando_responsable,
        cantidadFuncionarios: m._count?.funcionarios_misiones || 0,
      })),
      meta: {
        total,
        activas,
        finalizadas,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

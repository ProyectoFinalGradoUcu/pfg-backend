import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { CreateMisionDto } from './dto/create-mision.dto';
import { UpdateMisionDto } from './dto/update-mision.dto';
import { FuncionarioMisionDto } from './dto/funcionario-mision.dto';
import { UpdateFuncionarioDto } from './dto/update-funcionario.dto';

@Injectable()
export class MisionesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMisionDto) {
    const mision = await this.prisma.misiones.create({
      data: {
        ...dto,
        fecha_salida: dto.fecha_salida ? new Date(dto.fecha_salida) : undefined,
        fecha_llegada: dto.fecha_llegada ? new Date(dto.fecha_llegada) : undefined,
      },
    });
    return { id: mision.id.toString() };
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const now = new Date();

    const [misiones, total, activas, finalizadas] = await Promise.all([
      this.prisma.misiones.findMany({
        skip,
        take: limit,
        orderBy: { fecha_salida: 'desc' },
        include: { _count: { select: { funcionarios_misiones: true } } },
      }),
      this.prisma.misiones.count(),
      this.prisma.misiones.count({
        where: {
          fecha_salida: { lte: now },
          OR: [{ fecha_llegada: null }, { fecha_llegada: { gte: now } }],
        },
      }),
      this.prisma.misiones.count({ where: { fecha_llegada: { lt: now } } }),
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
        observaciones: m.observaciones,
        comando_responsable: m.comando_responsable,
        total_funcionarios: m._count.funcionarios_misiones,
      })),
      total,
      page,
      limit,
      stats: { total, activas, finalizadas },
    };
  }

  async findOne(id: string) {
    const mision = await this.prisma.misiones.findUnique({
      where: { id: BigInt(id) },
      include: {
        _count: {
          select: { funcionarios_misiones: true },
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
      total_funcionarios: mision._count.funcionarios_misiones,
    };
  }

  async getFuncionariosDeMision(misionId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const exists = await this.prisma.misiones.findUnique({ where: { id: BigInt(misionId) } });
    if (!exists) throw new NotFoundException('Misión no encontrada');

    const [funcionarios, total] = await Promise.all([
      this.prisma.funcionarios_misiones.findMany({
        where: { mision_id: BigInt(misionId) },
        skip,
        take: limit,
        include: {
          personas: {
            select: { id: true, cedula: true, primer_nombre: true, primer_apellido: true },
          },
        },
      }),
      this.prisma.funcionarios_misiones.count({
        where: { mision_id: BigInt(misionId) },
      }),
    ]);

    return {
      data: funcionarios.map((f) => ({
        persona_id: f.persona_id.toString(),
        cedula: f.personas?.cedula ?? null,
        primer_nombre: f.personas?.primer_nombre ?? null,
        primer_apellido: f.personas?.primer_apellido ?? null,
        boletin: f.boletin,
        observaciones: f.observaciones,
        numero_control_migratorio: f.numero_control_migratorio,
      })),
      total,
      page,
      limit,
    };
  }

  async update(id: string, dto: UpdateMisionDto) {
    const exists = await this.prisma.misiones.findUnique({ where: { id: BigInt(id) } });
    if (!exists) throw new NotFoundException('Misión no encontrada');

    await this.prisma.misiones.update({
      where: { id: BigInt(id) },
      data: {
        ...dto,
        fecha_salida: dto.fecha_salida ? new Date(dto.fecha_salida) : undefined,
        fecha_llegada: dto.fecha_llegada ? new Date(dto.fecha_llegada) : undefined,
      },
    });

    return { id };
  }

  async remove(id: string) {
    const exists = await this.prisma.misiones.findUnique({ where: { id: BigInt(id) } });
    if (!exists) throw new NotFoundException('Misión no encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.funcionarios_misiones.deleteMany({ where: { mision_id: BigInt(id) } });
      await tx.misiones.delete({ where: { id: BigInt(id) } });
    });

    return null;
  }


  async addFuncionarios(misionId: string, funcionarios: FuncionarioMisionDto[]) {
    const exists = await this.prisma.misiones.findUnique({ where: { id: BigInt(misionId) } });
    if (!exists) throw new NotFoundException('Misión no encontrada');

    if (funcionarios.length === 0) return null;

    await this.prisma.$transaction(async (tx) => {
      const personasIds = funcionarios.map((f) => BigInt(f.persona_id));
      const personasExistentes = await tx.personas.findMany({
        where: { id: { in: personasIds } },
        select: { id: true },
      });
      if (personasExistentes.length !== personasIds.length) {
        throw new BadRequestException('Uno o más funcionarios no existen');
      }

      await tx.funcionarios_misiones.createMany({
        data: funcionarios.map((f) => ({
          mision_id: BigInt(misionId),
          persona_id: BigInt(f.persona_id),
          boletin: f.boletin,
          observaciones: f.observaciones,
          numero_control_migratorio: f.numero_control_migratorio,
        })),
        skipDuplicates: true,
      });
    });

    return null;
  }

  async updateFuncionario(misionId: string, personaId: string, dto: UpdateFuncionarioDto) {
    const link = await this.prisma.funcionarios_misiones.findUnique({
      where: { persona_id_mision_id: { persona_id: BigInt(personaId), mision_id: BigInt(misionId) } },
    });
    if (!link) throw new NotFoundException('Funcionario no asignado a esta misión');

    await this.prisma.funcionarios_misiones.update({
      where: { persona_id_mision_id: { persona_id: BigInt(personaId), mision_id: BigInt(misionId) } },
      data: dto,
    });

    return null;
  }

  async deleteFuncionario(misionId: string, personaId: string) {
    const link = await this.prisma.funcionarios_misiones.findUnique({
      where: { persona_id_mision_id: { persona_id: BigInt(personaId), mision_id: BigInt(misionId) } },
    });
    if (!link) throw new NotFoundException('Funcionario no asignado a esta misión');

    await this.prisma.funcionarios_misiones.delete({
      where: { persona_id_mision_id: { persona_id: BigInt(personaId), mision_id: BigInt(misionId) } },
    });

    return null;
  }

  async deleteAllFuncionarios(misionId: string) {
    const exists = await this.prisma.misiones.findUnique({ where: { id: BigInt(misionId) } });
    if (!exists) throw new NotFoundException('Misión no encontrada');

    await this.prisma.funcionarios_misiones.deleteMany({ where: { mision_id: BigInt(misionId) } });

    return null;
  }
}

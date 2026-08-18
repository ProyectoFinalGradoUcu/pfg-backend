import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import { CreateUnidadDto } from './dto/create-unidad.dto.js';
import { UpdateUnidadDto } from './dto/update-unidad.dto.js';

@Injectable()
export class CatalogosService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Unidades: alta, edición y baja ────────────────────────────────────────
  // El catálogo lo comparten destinos y las relaciones laborales de
  // liquidación, así que la baja es lógica: nunca se borra una fila.

  private mapUnidad(u: {
    id: bigint;
    codigo: string;
    denominacion: string;
    tipo: string | null;
    vigente: boolean;
  }) {
    return {
      id: u.id.toString(),
      codigo: u.codigo,
      denominacion: u.denominacion,
      tipo: u.tipo,
      vigente: u.vigente,
    };
  }

  /**
   * Una unidad no se puede dar de baja mientras siga en uso. Dos motivos:
   *
   * 1. Destinos vigentes: quedaría un funcionario revistando en una unidad que
   *    el resto del sistema considera inexistente.
   * 2. Relaciones laborales vigentes: `unidades` y `relaciones_laborales` son
   *    tablas del sistema de liquidación de sueldos, que comparte esta base y
   *    calcula por relación laboral. Darla de baja le dejaría relaciones activas
   *    apuntando a una unidad no vigente.
   */
  private async assertUnidadSinUso(unidadId: bigint, denominacion: string) {
    const [destinados, relaciones] = await Promise.all([
      this.prisma.destinos.count({
        where: { unidad_id: unidadId, fecha_fin: null },
      }),
      this.prisma.relaciones_laborales.count({
        where: { unidad_id: unidadId, fecha_fin: null },
      }),
    ]);

    if (destinados > 0) {
      throw new ConflictException(
        `No se puede dar de baja la unidad "${denominacion}": tiene ${destinados} ` +
          `${destinados === 1 ? 'funcionario' : 'funcionarios'} con destino vigente. ` +
          'Reasignalos antes de darla de baja.',
      );
    }

    if (relaciones > 0) {
      throw new ConflictException(
        `No se puede dar de baja la unidad "${denominacion}": hay ${relaciones} ` +
          `${relaciones === 1 ? 'relación laboral vigente' : 'relaciones laborales vigentes'} ` +
          'que la referencian, y liquidación las usa para calcular sueldos. ' +
          'Cambiá la unidad de esos funcionarios antes de darla de baja.',
      );
    }
  }

  async crearUnidad(dto: CreateUnidadDto) {
    const codigoEnUso = await this.prisma.unidades.findFirst({
      where: { codigo: { equals: dto.codigo, mode: 'insensitive' } },
    });
    if (codigoEnUso) {
      throw new ConflictException(`Ya existe una unidad con código "${dto.codigo}"`);
    }

    const denominacionEnUso = await this.prisma.unidades.findFirst({
      where: { denominacion: { equals: dto.denominacion, mode: 'insensitive' } },
    });
    if (denominacionEnUso) {
      throw new ConflictException(`Ya existe una unidad llamada "${dto.denominacion}"`);
    }

    const unidad = await this.prisma.unidades.create({
      data: {
        codigo: dto.codigo,
        denominacion: dto.denominacion,
        tipo: dto.tipo ?? null,
        vigente: true,
      },
    });

    return this.mapUnidad(unidad);
  }

  async editarUnidad(unidadId: number, dto: UpdateUnidadDto) {
    const unidad = await this.prisma.unidades.findUnique({ where: { id: BigInt(unidadId) } });
    if (!unidad) throw new NotFoundException(`No existe unidad con id ${unidadId}`);

    if (dto.denominacion && dto.denominacion !== unidad.denominacion) {
      const dup = await this.prisma.unidades.findFirst({
        where: {
          denominacion: { equals: dto.denominacion, mode: 'insensitive' },
          id: { not: BigInt(unidadId) },
        },
      });
      if (dup) {
        throw new ConflictException(`Ya existe una unidad llamada "${dto.denominacion}"`);
      }
    }

    if (dto.vigente === false) {
      await this.assertUnidadSinUso(BigInt(unidadId), unidad.denominacion);
    }

    const actualizada = await this.prisma.unidades.update({
      where: { id: BigInt(unidadId) },
      data: {
        ...(dto.denominacion !== undefined && { denominacion: dto.denominacion }),
        ...(dto.tipo !== undefined && { tipo: dto.tipo }),
        ...(dto.vigente !== undefined && { vigente: dto.vigente }),
      },
    });

    return this.mapUnidad(actualizada);
  }

  /**
   * Baja lógica. Los destinos históricos y las relaciones laborales que la
   * referencian quedan intactos, pero no puede haber nadie revistando en ella.
   */
  async darDeBajaUnidad(unidadId: number) {
    const unidad = await this.prisma.unidades.findUnique({ where: { id: BigInt(unidadId) } });
    if (!unidad) throw new NotFoundException(`No existe unidad con id ${unidadId}`);

    await this.assertUnidadSinUso(BigInt(unidadId), unidad.denominacion);

    const actualizada = await this.prisma.unidades.update({
      where: { id: BigInt(unidadId) },
      data: { vigente: false },
    });

    return this.mapUnidad(actualizada);
  }

  async findUnidades() {
    const items = await this.prisma.unidades.findMany({
      where: { vigente: true },
      orderBy: { denominacion: 'asc' },
      select: { id: true, codigo: true, denominacion: true },
    });
    return items.map((i) => ({ id: Number(i.id), codigo: i.codigo, denominacion: i.denominacion }));
  }

  async findSituaciones() {
    const items = await this.prisma.situaciones.findMany({
      where: { vigente: true },
      orderBy: { denominacion: 'asc' },
      select: { id: true, codigo: true, denominacion: true },
    });
    return items.map((i) => ({ id: Number(i.id), codigo: i.codigo, denominacion: i.denominacion }));
  }

  async findEscalafones() {
    const items = await this.prisma.escalafones.findMany({
      where: { vigente: true },
      orderBy: { denominacion: 'asc' },
      select: { id: true, codigo: true, denominacion: true },
    });
    return items.map((i) => ({ id: Number(i.id), codigo: i.codigo, denominacion: i.denominacion }));
  }

  async findGrados(escalafon_id?: number) {
    const items = await this.prisma.grados.findMany({
      where: {
        vigente: true,
        ...(escalafon_id ? { escalafon_id: BigInt(escalafon_id) } : {}),
      },
      orderBy: { orden: 'asc' },
      select: { id: true, codigo: true, denominacion: true, escalafon_id: true, orden: true },
    });
    return items.map((i) => ({
      id: Number(i.id),
      codigo: i.codigo,
      denominacion: i.denominacion,
      escalafon_id: Number(i.escalafon_id),
      orden: i.orden,
    }));
  }

  async findRegimenes() {
    const items = await this.prisma.regimenes.findMany({
      where: { vigente: true },
      orderBy: { denominacion: 'asc' },
      select: { id: true, numero_ley: true, denominacion: true },
    });
    return items.map((i) => ({ id: Number(i.id), numero_ley: i.numero_ley, denominacion: i.denominacion }));
  }

  async findProgramas() {
    const items = await this.prisma.programas.findMany({
      where: { vigente: true },
      orderBy: { denominacion: 'asc' },
      select: { id: true, codigo: true, denominacion: true },
    });
    return items.map((i) => ({ id: Number(i.id), codigo: i.codigo, denominacion: i.denominacion }));
  }

  async findSubUnidades() {
    const items = await this.prisma.sub_unidades.findMany({
      where: { vigente: true },
      orderBy: { denominacion: 'asc' },
      select: { id: true, codigo: true, denominacion: true },
    });
    return items.map((i) => ({ id: Number(i.id), codigo: i.codigo, denominacion: i.denominacion }));
  }
}

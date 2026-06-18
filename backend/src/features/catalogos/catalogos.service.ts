import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';

@Injectable()
export class CatalogosService {
  constructor(private readonly prisma: PrismaService) {}

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

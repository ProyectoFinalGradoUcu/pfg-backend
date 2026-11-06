import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';

@Injectable()
export class CatalogosService {
  constructor(private readonly prisma: PrismaService) {}

  // Unidades (comandos) y sub-unidades son catálogos de liquidación: acá solo se leen.
  // Si hace falta una nueva, la carga liquidación.

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

  async findMotivosBaja() {
    const items = await this.prisma.motivos_baja.findMany({
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
    const escalafon = escalafon_id
      ? await this.prisma.escalafones.findUnique({
          where: { id: BigInt(escalafon_id) },
          select: { codigo: true },
        })
      : null;

    let filtroEscalafon = {};
    if (escalafon_id) {
      if (!escalafon) return [];

      // El catálogo compartido de producción no vincula los grados a escalafones.
      // SG/ST usan la escala subalterna, AT la aerotécnica y el resto la oficial.
      filtroEscalafon = {
        OR: [
          { escalafon_id: BigInt(escalafon_id) },
          ...(escalafon.codigo === 'AT'
            ? [{ codigo: { in: ['AT_2DA', 'AT_1RA', 'AT_PPAL', 'INST_AT', 'SUP_AT'] } }]
            : [{ [escalafon.codigo === 'SG' || escalafon.codigo === 'ST' ? 'es_subalterno' : 'es_oficial']: true }]),
        ],
      };
    }

    const items = await this.prisma.grados.findMany({
      where: {
        vigente: true,
        ...filtroEscalafon,
      },
      orderBy: { orden: 'asc' },
      select: { id: true, codigo: true, denominacion: true, escalafon_id: true, orden: true },
    });
    return items.map((i) => ({
      id: Number(i.id),
      codigo: i.codigo,
      denominacion: i.denominacion,
      escalafon_id: i.escalafon_id ? Number(i.escalafon_id) : null,
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
      orderBy: [{ unidades: { denominacion: 'asc' } }, { denominacion: 'asc' }],
      select: {
        id: true,
        codigo: true,
        denominacion: true,
        unidad_id: true,
        unidades: { select: { codigo: true, denominacion: true } },
      },
    });
    // El comando va para agrupar y para mostrar la base como "B.A.I. (C.A.O.)".
    return items.map((i) => ({
      id: Number(i.id),
      codigo: i.codigo,
      denominacion: i.denominacion,
      unidad_id: Number(i.unidad_id),
      comando: {
        id: Number(i.unidad_id),
        codigo: i.unidades.codigo,
        denominacion: i.unidades.denominacion,
      },
    }));
  }
}

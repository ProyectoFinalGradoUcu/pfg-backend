import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { EstadisticasQueryDto } from './dto/estadisticas-query.dto.js';
import { ESCALERA_FAU } from './ascensos.constants.js';

@Injectable()
export class EstadisticasAscensoService {
  constructor(private readonly prisma: PrismaService) {}

  async estadisticas(query: EstadisticasQueryDto = {}, alcance?: AlcanceResuelto) {
    const anioHasta = query.anio_hasta ?? new Date().getUTCFullYear();
    const anioDesde = query.anio_desde ?? anioHasta - 9;
    const desde = new Date(Date.UTC(anioDesde, 0, 1));
    const hasta = new Date(Date.UTC(anioHasta + 1, 0, 1));

    const where: Prisma.ascensosWhereInput = {
      fecha_ascenso: { gte: desde, lt: hasta },
    };
    if (alcance?.tipo === 'unidad') {
      where.relacion_laboral_nueva = {
        unidad_id: { in: alcance.unidadIds.map((u) => BigInt(u)) },
      };
    }

    const [ascensos, anulados, dotacion, grados] = await Promise.all([
      this.prisma.ascensos.count({ where: { ...where, anulado_en: null } }),
      this.prisma.ascensos.count({ where: { ...where, anulado_en: { not: null } } }),
      this.prisma.relaciones_laborales.groupBy({
        by: ['grado_id'],
        where: { fecha_fin: null },
        _count: { _all: true },
      }),
      this.prisma.grados.findMany({
        select: { id: true, codigo: true, denominacion: true, orden: true },
      }),
    ]);

    return {
      totales: { ascensos, anulados },
      piramide: this.piramide(dotacion, grados),
    };
  }

  /** Dotación por grado, en el orden de la escala. */
  private piramide(
    dotacion: { grado_id: bigint; _count: { _all: number } }[],
    grados: { id: bigint; codigo: string; denominacion: string; orden: number }[],
  ) {
    const porGrado = new Map(dotacion.map((d) => [d.grado_id.toString(), d._count._all]));
    const enLaEscala = new Set(ESCALERA_FAU.flatMap((g) => [...g.grados] as string[]));

    return grados
      .filter((g) => enLaEscala.has(g.codigo))
      .map((g) => ({
        grado: g.denominacion,
        codigo: g.codigo,
        orden: g.orden,
        dotacion: porGrado.get(g.id.toString()) ?? 0,
      }))
      .sort((a, b) => a.orden - b.orden);
  }
}

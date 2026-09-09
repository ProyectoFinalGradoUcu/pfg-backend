import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { assertPersonaEnAlcance } from '../../lib/alcance/alcance.where.js';
import { LegajoMilitarDto } from './dto/legajo-militar.dto.js';
import {
  ETIQUETAS_NIVEL_EDUCATIVO,
  NivelEducativo,
  esMutado,
} from './legajo-militar.constants.js';

type LegajoFila = {
  nivel_educativo: string | null;
  fecha_ingreso_eta: Date | null;
  fecha_egreso_eta: Date | null;
  numero_orden_egreso_eta: string | null;
  actualizado_en: Date;
} | null;

const soloFecha = (fecha: Date | null) =>
  fecha ? fecha.toISOString().split('T')[0] : null;

const aFecha = (valor: string | null | undefined) =>
  valor == null ? null : new Date(valor);

export type DatosLegajoMilitar = Pick<
  LegajoMilitarDto,
  'nivel_educativo' | 'fecha_ingreso_eta' | 'fecha_egreso_eta' | 'numero_orden_egreso_eta'
>;

/** Para el alta, la edición y la carga masiva, que abren su propia transacción. */
export async function guardarLegajoEnTransaccion(
  tx: Prisma.TransactionClient,
  personaId: bigint,
  dto: DatosLegajoMilitar,
) {
  const hayDatos =
    dto.nivel_educativo !== undefined ||
    dto.fecha_ingreso_eta !== undefined ||
    dto.fecha_egreso_eta !== undefined ||
    dto.numero_orden_egreso_eta !== undefined;
  if (!hayDatos) return;

  await tx.legajo_militar.upsert({
    where: { persona_id: personaId },
    create: {
      persona_id: personaId,
      nivel_educativo: dto.nivel_educativo ?? null,
      fecha_ingreso_eta: aFecha(dto.fecha_ingreso_eta),
      fecha_egreso_eta: aFecha(dto.fecha_egreso_eta),
      numero_orden_egreso_eta: dto.numero_orden_egreso_eta ?? null,
    },
    update: {
      ...(dto.nivel_educativo !== undefined && {
        nivel_educativo: dto.nivel_educativo ?? null,
      }),
      ...(dto.fecha_ingreso_eta !== undefined && {
        fecha_ingreso_eta: aFecha(dto.fecha_ingreso_eta),
      }),
      ...(dto.fecha_egreso_eta !== undefined && {
        fecha_egreso_eta: aFecha(dto.fecha_egreso_eta),
      }),
      ...(dto.numero_orden_egreso_eta !== undefined && {
        numero_orden_egreso_eta: dto.numero_orden_egreso_eta ?? null,
      }),
      actualizado_en: new Date(),
    },
  });
}

/**
 * Nivel educativo y egreso de la ETA, en `legajo_militar`, más la mutación de
 * escalafón, que vive en `relaciones_laborales.mutaciones`.
 */
@Injectable()
export class LegajoMilitarService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(id: number, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);
    const personaId = BigInt(id);

    const [persona, legajo, relacion] = await Promise.all([
      this.prisma.personas.findUnique({
        where: { id: personaId },
        select: { id: true },
      }),
      this.prisma.legajo_militar.findUnique({
        where: { persona_id: personaId },
        select: {
          nivel_educativo: true,
          fecha_ingreso_eta: true,
          fecha_egreso_eta: true,
          numero_orden_egreso_eta: true,
          actualizado_en: true,
        },
      }),
      this.relacionVigente(personaId),
    ]);

    if (!persona) throw new NotFoundException(`No existe personal con id ${id}`);

    return this.mapLegajo(id, legajo, relacion?.mutaciones ?? null);
  }

  /** Upsert: la fila es 1:1 con la persona y puede no existir todavía. */
  async guardar(id: number, dto: LegajoMilitarDto, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);
    const personaId = BigInt(id);

    const persona = await this.prisma.personas.findUnique({
      where: { id: personaId },
      select: { id: true },
    });
    if (!persona) throw new NotFoundException(`No existe personal con id ${id}`);

    const tocaLegajo =
      dto.nivel_educativo !== undefined ||
      dto.fecha_ingreso_eta !== undefined ||
      dto.fecha_egreso_eta !== undefined ||
      dto.numero_orden_egreso_eta !== undefined;

    const { legajo, relacion } = await this.prisma.$transaction(async (tx) => {
      let legajoFila: LegajoFila = await tx.legajo_militar.findUnique({
        where: { persona_id: personaId },
        select: {
          nivel_educativo: true,
          fecha_ingreso_eta: true,
          fecha_egreso_eta: true,
          numero_orden_egreso_eta: true,
          actualizado_en: true,
        },
      });

      if (tocaLegajo) {
        legajoFila = await tx.legajo_militar.upsert({
          where: { persona_id: personaId },
          create: {
            persona_id: personaId,
            nivel_educativo: dto.nivel_educativo ?? null,
            fecha_ingreso_eta: aFecha(dto.fecha_ingreso_eta),
            fecha_egreso_eta: aFecha(dto.fecha_egreso_eta),
            numero_orden_egreso_eta: dto.numero_orden_egreso_eta ?? null,
          },
          update: {
            ...(dto.nivel_educativo !== undefined && {
              nivel_educativo: dto.nivel_educativo ?? null,
            }),
            ...(dto.fecha_ingreso_eta !== undefined && {
              fecha_ingreso_eta: aFecha(dto.fecha_ingreso_eta),
            }),
            ...(dto.fecha_egreso_eta !== undefined && {
              fecha_egreso_eta: aFecha(dto.fecha_egreso_eta),
            }),
            ...(dto.numero_orden_egreso_eta !== undefined && {
              numero_orden_egreso_eta: dto.numero_orden_egreso_eta ?? null,
            }),
            actualizado_en: new Date(),
          },
          select: {
            nivel_educativo: true,
            fecha_ingreso_eta: true,
            fecha_egreso_eta: true,
            numero_orden_egreso_eta: true,
            actualizado_en: true,
          },
        });
      }

      if (dto.mutaciones !== undefined) {
        await tx.relaciones_laborales.updateMany({
          where: { persona_id: personaId, fecha_fin: null },
          data: { mutaciones: dto.mutaciones ?? null },
        });
      }

      const relacionFila = await tx.relaciones_laborales.findFirst({
        where: { persona_id: personaId, fecha_fin: null },
        orderBy: { fecha_inicio: 'desc' },
        select: { mutaciones: true },
      });

      return { legajo: legajoFila, relacion: relacionFila };
    });

    return this.mapLegajo(id, legajo, relacion?.mutaciones ?? null);
  }

  private relacionVigente(personaId: bigint) {
    return this.prisma.relaciones_laborales.findFirst({
      where: { persona_id: personaId, fecha_fin: null },
      orderBy: { fecha_inicio: 'desc' },
      select: { mutaciones: true },
    });
  }

  private mapLegajo(id: number, legajo: LegajoFila, mutaciones: string | null) {
    const nivel = legajo?.nivel_educativo ?? null;
    return {
      persona_id: id,
      nivel_educativo: nivel,
      nivel_educativo_label: nivel
        ? (ETIQUETAS_NIVEL_EDUCATIVO[nivel as NivelEducativo] ?? nivel)
        : null,
      fecha_ingreso_eta: soloFecha(legajo?.fecha_ingreso_eta ?? null),
      fecha_egreso_eta: soloFecha(legajo?.fecha_egreso_eta ?? null),
      numero_orden_egreso_eta: legajo?.numero_orden_egreso_eta ?? null,
      egresado_eta: (legajo?.fecha_egreso_eta ?? null) !== null,
      mutaciones,
      es_mutado: esMutado(mutaciones),
      actualizado_en: legajo?.actualizado_en ?? null,
    };
  }

  private async assertAlcance(id: number, alcance?: AlcanceResuelto) {
    if (!alcance) return;
    await assertPersonaEnAlcance(this.prisma, BigInt(id), alcance);
  }
}

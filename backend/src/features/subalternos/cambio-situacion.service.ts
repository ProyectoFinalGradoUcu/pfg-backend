import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { assertPersonaEnAlcance } from '../../lib/alcance/alcance.where.js';
import { DerechaService } from '../derecha/derecha.service.js';
import {
  ESTADO_RELACION_ACTIVA,
  ESTADO_RELACION_INACTIVA,
  LOCK_ASCENSO_PERSONA,
  SITUACIONES_ELEGIBLES_POR_DEFECTO,
  TIPO_MOVIMIENTO_CIERRE,
} from '../ascensos/ascensos.constants.js';
import type { CambiarSituacionDto, CambioSituacion } from './dto/cambiar-situacion.dto.js';

type Categoria = 'oficial' | 'subalterno';

/**
 * Situaciones de liquidación sin cobro (`afecta_cobro = false`) que se manejan con este cambio.
 * Para subalternos liquidación no tiene No Disponible.
 */
export const SITUACION_LICENCIA_SIN_GOCE: Record<Categoria, string> = { oficial: 'SIT03', subalterno: 'SIT09' };
export const SITUACION_NO_DISPONIBLE = 'SIT04';
export const SITUACIONES_FUERA_DE_ACTIVIDAD = ['SIT03', 'SIT04', 'SIT09'];

/** Situaciones de actividad de cada escala, incluido el reincorporado (se paga distinto). */
const ACTIVIDAD: Record<Categoria, string[]> = { oficial: ['SIT01', 'SIT16'], subalterno: ['SIT07', 'SIT17'] };
const ACTIVIDAD_POR_DEFECTO: Record<Categoria, string> = { oficial: 'SIT01', subalterno: 'SIT07' };

/** Movimiento que queda en la relación nueva. Por nombre: el catálogo es de liquidación. */
const MOVIMIENTO_ALTA: Record<CambioSituacion, string> = {
  LICENCIA_SIN_GOCE: 'Licencia Sin Goce',
  NO_DISPONIBLE: TIPO_MOVIMIENTO_CIERRE,
  VOLVER_A_ACTIVIDAD: 'Reintegro',
};

const soloFecha = (f: Date) => f.toISOString().split('T')[0];

/**
 * Cambio de situación como lo hace liquidación: la relación activa se cierra y se abre otra con
 * la situación nueva y todo lo demás igual, incluida la fecha de inicio (si cambia, liquidación
 * calcula mal la antigüedad). Liquidación paga toda relación `activo`, así que nunca pueden quedar
 * dos. La fecha del cambio queda en la de fin de la relación cerrada y en los movimientos.
 */
@Injectable()
export class CambioSituacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly derecha: DerechaService,
  ) {}

  async cambiar(personaId: number, dto: CambiarSituacionDto, autorId: bigint | null, alcance?: AlcanceResuelto) {
    const id = BigInt(personaId);
    if (alcance) await assertPersonaEnAlcance(this.prisma, id, alcance);

    const fecha = new Date(dto.fecha);
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    if (fecha > hoy) {
      throw new UnprocessableEntityException(
        'La fecha del cambio de situación no puede ser futura: liquidación lo aplica en el próximo cálculo',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // El mismo lock que el ascenso: los dos cierran la relación activa de la persona.
      const clave = Number(id % 2_147_483_647n);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ASCENSO_PERSONA}::int, ${clave}::int)`;

      const activas = await tx.relaciones_laborales.findMany({
        where: { persona_id: id, estado: ESTADO_RELACION_ACTIVA, fecha_fin: null },
        include: {
          situaciones: { select: { id: true, codigo: true, denominacion: true } },
          grados: { select: { es_oficial: true, es_subalterno: true } },
        },
      });
      if (activas.length === 0) {
        throw new UnprocessableEntityException('El funcionario no tiene una relación laboral activa');
      }
      if (activas.length > 1) {
        throw new ConflictException(
          'El funcionario tiene más de una relación laboral activa: hay que corregirlo antes de cambiar la situación',
        );
      }
      const actual = activas[0];
      const categoria = categoriaDe(actual.tipo_funcionario, actual.grados);
      if (!categoria) {
        throw new UnprocessableEntityException('El cambio de situación es solo para personal superior o subalterno');
      }

      const codigoActual = actual.situaciones.codigo;
      const codigoNuevo = await this.situacionDestino(tx, dto.cambio, categoria, codigoActual, actual.id, id);

      const ultimo = await tx.movimientos_laborales.findFirst({
        where: { relaciones_laborales: { persona_id: id } },
        orderBy: { fecha_movimiento: 'desc' },
        select: { fecha_movimiento: true },
      });
      if (ultimo && fecha < ultimo.fecha_movimiento) {
        throw new UnprocessableEntityException(
          `La fecha del cambio (${soloFecha(fecha)}) es anterior al último movimiento del funcionario (${soloFecha(ultimo.fecha_movimiento)})`,
        );
      }

      const [situacion, tipoCierre, tipoAlta] = await Promise.all([
        tx.situaciones.findFirst({ where: { codigo: codigoNuevo }, select: { id: true, codigo: true, denominacion: true } }),
        tipoMovimiento(tx, TIPO_MOVIMIENTO_CIERRE),
        tipoMovimiento(tx, MOVIMIENTO_ALTA[dto.cambio]),
      ]);
      if (!situacion) {
        throw new BadRequestException(`Falta la situación ${codigoNuevo} en el catálogo de liquidación`);
      }

      await tx.relaciones_laborales.update({
        where: { id: actual.id },
        data: { fecha_fin: fecha, estado: ESTADO_RELACION_INACTIVA, fecha_actualizacion: new Date() },
      });

      const nueva = await tx.relaciones_laborales.create({
        data: {
          persona_id: actual.persona_id,
          regimen_id: actual.regimen_id,
          unidad_id: actual.unidad_id,
          sub_unidad_id: actual.sub_unidad_id,
          programa_id: actual.programa_id,
          situacion_id: situacion.id,
          escalafon_id: actual.escalafon_id,
          grado_id: actual.grado_id,
          // Se preserva: es la fecha de ingreso con la que liquidación calcula la antigüedad.
          fecha_inicio: actual.fecha_inicio,
          fecha_fin: null,
          estado: ESTADO_RELACION_ACTIVA,
          prima_tecnica: actual.prima_tecnica,
          prima_solidaria_familiar: actual.prima_solidaria_familiar,
          riesgo_vuelo: actual.riesgo_vuelo,
          anios_inactivos: actual.anios_inactivos,
          observaciones: actual.observaciones,
          motivo_baja_id: actual.motivo_baja_id,
          fecha_ultimo_ascenso: actual.fecha_ultimo_ascenso,
          grado_reincorporacion_id: actual.grado_reincorporacion_id,
          haber_retiro: actual.haber_retiro,
          porcentaje_progresivo: actual.porcentaje_progresivo,
          fecha_ascenso_oficial: actual.fecha_ascenso_oficial,
          superprima: actual.superprima,
          tipo_funcionario: actual.tipo_funcionario,
          tiene_mando: actual.tiene_mando,
          mutaciones: actual.mutaciones,
          conducta: actual.conducta,
          anios_servicio_anterior: actual.anios_servicio_anterior,
          categoria_viatico: actual.categoria_viatico,
          usa_fonasa: actual.usa_fonasa,
          codigos_legajo: actual.codigos_legajo,
          // derecha, numor y escala_derecha los pasa DerechaService.
        },
      });

      await this.derecha.trasladarARelacionEnTransaccion(tx, actual.id, nueva.id);

      const observaciones = textoMovimiento(dto);
      await tx.movimientos_laborales.createMany({
        data: [
          {
            relacion_laboral_id: actual.id,
            tipo_movimiento_id: tipoCierre.id,
            fecha_movimiento: fecha,
            usuario_id: autorId,
            observaciones,
          },
          {
            relacion_laboral_id: nueva.id,
            tipo_movimiento_id: tipoAlta.id,
            fecha_movimiento: fecha,
            usuario_id: autorId,
            observaciones,
          },
        ],
      });

      return {
        persona_id: id,
        relacion_anterior_id: actual.id,
        relacion_nueva_id: nueva.id,
        fecha: soloFecha(fecha),
        situacion_anterior: actual.situaciones,
        situacion,
      };
    });
  }

  /** Qué situación corresponde, o por qué no se puede. */
  private async situacionDestino(
    tx: Prisma.TransactionClient,
    cambio: CambioSituacion,
    categoria: Categoria,
    codigoActual: string,
    relacionActualId: bigint,
    personaId: bigint,
  ): Promise<string> {
    const fueraDeActividad = SITUACIONES_FUERA_DE_ACTIVIDAD.includes(codigoActual);

    if (cambio === 'VOLVER_A_ACTIVIDAD') {
      if (!fueraDeActividad) {
        throw new UnprocessableEntityException(
          'El funcionario no está con licencia sin goce ni No Disponible: no hay de dónde volver',
        );
      }
      return this.situacionAnterior(tx, categoria, relacionActualId, personaId);
    }

    if (!SITUACIONES_ELEGIBLES_POR_DEFECTO.includes(codigoActual)) {
      throw new UnprocessableEntityException(
        fueraDeActividad
          ? 'El funcionario ya está con licencia sin goce o No Disponible: primero tiene que volver a actividad'
          : `La licencia sin goce y el No Disponible son para funcionarios en actividad; la situación actual es ${codigoActual}`,
      );
    }
    if (cambio === 'NO_DISPONIBLE') {
      if (categoria !== 'oficial') {
        throw new UnprocessableEntityException(
          'Liquidación no tiene la situación No Disponible para personal subalterno',
        );
      }
      return SITUACION_NO_DISPONIBLE;
    }
    return SITUACION_LICENCIA_SIN_GOCE[categoria];
  }

  /**
   * La de actividad que tenía antes de salir: la última relación anterior que no esté fuera de
   * actividad. Si no hay (por ejemplo, se importó ya con licencia) o la anterior terminó en una
   * baja, la de actividad de su escala.
   */
  private async situacionAnterior(
    tx: Prisma.TransactionClient,
    categoria: Categoria,
    relacionActualId: bigint,
    personaId: bigint,
  ): Promise<string> {
    const anteriores = await tx.relaciones_laborales.findMany({
      where: { persona_id: personaId, id: { lt: relacionActualId } },
      orderBy: { id: 'desc' },
      take: 20,
      select: { motivo_baja_id: true, situaciones: { select: { codigo: true } } },
    });
    for (const r of anteriores) {
      if (r.motivo_baja_id !== null) break; // Otra carrera: terminó en un retiro o una baja.
      if (SITUACIONES_FUERA_DE_ACTIVIDAD.includes(r.situaciones.codigo)) continue;
      return ACTIVIDAD[categoria].includes(r.situaciones.codigo) ? r.situaciones.codigo : ACTIVIDAD_POR_DEFECTO[categoria];
    }
    return ACTIVIDAD_POR_DEFECTO[categoria];
  }
}

function categoriaDe(
  tipoFuncionario: string | null,
  grado: { es_oficial: boolean | null; es_subalterno: boolean | null } | null,
): Categoria | null {
  if (tipoFuncionario === 'oficial' || tipoFuncionario === 'subalterno') return tipoFuncionario;
  if (grado?.es_oficial) return 'oficial';
  if (grado?.es_subalterno) return 'subalterno';
  return null;
}

async function tipoMovimiento(tx: Prisma.TransactionClient, nombre: string) {
  const tipo = await tx.tipos_movimiento.findUnique({ where: { nombre }, select: { id: true } });
  if (!tipo) {
    throw new BadRequestException(
      `Falta el tipo de movimiento "${nombre}" en el catálogo: no se puede cambiar la situación`,
    );
  }
  return tipo;
}

function textoMovimiento(dto: CambiarSituacionDto): string {
  return [
    dto.numero_orden && `Orden ${dto.numero_orden}`,
    dto.boletin && `Boletín ${dto.boletin}`,
    dto.observaciones?.trim(),
  ]
    .filter(Boolean)
    .join(' · ');
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import {
  CODIGO_GRADO_SIN_PRIMA_TECNICA,
  CODIGO_PRIMER_GRADO_OFICIAL,
  ESTADO_RELACION_ACTIVA,
  ESTADO_RELACION_INACTIVA,
  PRIMA_TECNICA_VACIA,
  TIPO_MOVIMIENTO_ASCENSO,
  TIPO_MOVIMIENTO_CIERRE,
} from './ascensos.constants.js';

export interface RegistrarAscensoParams {
  persona_id: bigint;
  grado_destino_id: bigint;
  fecha_ascenso: Date;
  orden_ascenso_id?: bigint | null;
  numero_orden?: string | null;
  observaciones?: string | null;
  regla_id?: bigint | null;
  /** null = no había regla evaluable para ese grado. */
  cumplia_requisitos?: boolean | null;
  /** Foto del motor de elegibilidad al momento de ascender. */
  evaluacion?: Prisma.InputJsonValue | null;
  motivo_excepcion?: string | null;
  usuario_id?: bigint | null;
}

export interface AnularAscensoParams {
  motivo: string;
  usuario_id?: bigint | null;
}

/**
 * Único punto de escritura del módulo sobre las tablas del sistema de
 * liquidación. Replica su endpoint de ascenso (`RegistrarAscensoAsync`): cierra
 * la relación laboral vigente, abre una nueva con el grado destino y registra
 * los dos movimientos laborales.
 */
@Injectable()
export class AscensoRegistroService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(params: RegistrarAscensoParams) {
    return this.prisma.$transaction((tx) => this.registrarEnTransaccion(tx, params));
  }

  /** Para el alta de una orden, que asciende a N funcionarios en una transacción. */
  async registrarEnTransaccion(
    tx: Prisma.TransactionClient,
    params: RegistrarAscensoParams,
  ) {
    if (params.cumplia_requisitos === false && !params.motivo_excepcion?.trim()) {
      throw new BadRequestException(
        'Un ascenso por excepción necesita un motivo escrito',
      );
    }

    const relacionActual = await tx.relaciones_laborales.findFirst({
      where: { persona_id: params.persona_id, fecha_fin: null },
      orderBy: { fecha_inicio: 'desc' },
    });

    if (!relacionActual) {
      throw new BadRequestException(
        `El funcionario ${params.persona_id} no tiene una relación laboral vigente: no se le puede registrar un ascenso`,
      );
    }

    const [gradoActual, gradoDestino] = await Promise.all([
      tx.grados.findUnique({
        where: { id: relacionActual.grado_id },
        select: { id: true, codigo: true, denominacion: true, orden: true },
      }),
      tx.grados.findUnique({
        where: { id: params.grado_destino_id },
        select: { id: true, codigo: true, denominacion: true, orden: true, vigente: true },
      }),
    ]);

    if (!gradoDestino) {
      throw new NotFoundException(`No existe el grado ${params.grado_destino_id}`);
    }
    if (!gradoDestino.vigente) {
      throw new BadRequestException(
        `El grado ${gradoDestino.denominacion} no está vigente`,
      );
    }
    if (gradoActual && gradoDestino.orden <= gradoActual.orden) {
      // `grados.orden` es ascendente: ascender es siempre ir a un orden mayor.
      throw new BadRequestException(
        `El grado ${gradoDestino.denominacion} no es superior a ${gradoActual.denominacion}`,
      );
    }
    if (
      relacionActual.fecha_inicio &&
      params.fecha_ascenso < relacionActual.fecha_inicio
    ) {
      throw new BadRequestException(
        'La fecha del ascenso es anterior al inicio de la relación laboral vigente',
      );
    }

    const [tipoCierre, tipoAscenso] = await Promise.all([
      this.tipoMovimientoPorNombre(tx, TIPO_MOVIMIENTO_CIERRE),
      this.tipoMovimientoPorNombre(tx, TIPO_MOVIMIENTO_ASCENSO),
    ]);

    await tx.relaciones_laborales.update({
      where: { id: relacionActual.id },
      data: {
        fecha_fin: params.fecha_ascenso,
        estado: ESTADO_RELACION_INACTIVA,
      },
    });

    const esPrimerGradoOficial = gradoDestino.codigo === CODIGO_PRIMER_GRADO_OFICIAL;
    const relacionNueva = await tx.relaciones_laborales.create({
      data: {
        persona_id: relacionActual.persona_id,
        regimen_id: relacionActual.regimen_id,
        unidad_id: relacionActual.unidad_id,
        programa_id: relacionActual.programa_id,
        situacion_id: relacionActual.situacion_id,
        escalafon_id: relacionActual.escalafon_id,
        grado_id: gradoDestino.id,
        // Se preserva: resetearla rompe el progresivo por antigüedad.
        fecha_inicio: relacionActual.fecha_inicio,
        fecha_fin: null,
        estado: ESTADO_RELACION_ACTIVA,
        // Base de la permanencia 041.003.
        fecha_ultimo_ascenso: params.fecha_ascenso,
        // Base del progresivo 044.001: se sella una sola vez, al llegar a oficial.
        fecha_ascenso_oficial:
          esPrimerGradoOficial && relacionActual.fecha_ascenso_oficial == null
            ? params.fecha_ascenso
            : relacionActual.fecha_ascenso_oficial,
        // Igual que liquidación: al llegar a Sgto. 1.º se vacía la prima técnica.
        prima_tecnica:
          gradoDestino.codigo === CODIGO_GRADO_SIN_PRIMA_TECNICA
            ? PRIMA_TECNICA_VACIA
            : relacionActual.prima_tecnica,
        prima_solidaria_familiar: relacionActual.prima_solidaria_familiar,
        riesgo_vuelo: relacionActual.riesgo_vuelo,
        anios_inactivos: relacionActual.anios_inactivos,
        observaciones: params.observaciones ?? relacionActual.observaciones,
        sub_unidad_id: relacionActual.sub_unidad_id,
        motivo_baja_id: relacionActual.motivo_baja_id,
        grado_reincorporacion_id: relacionActual.grado_reincorporacion_id,
        haber_retiro: relacionActual.haber_retiro,
        porcentaje_progresivo: relacionActual.porcentaje_progresivo,
        superprima: relacionActual.superprima,
        tipo_funcionario: relacionActual.tipo_funcionario,
        tiene_mando: relacionActual.tiene_mando,
        mutaciones: relacionActual.mutaciones,
        conducta: relacionActual.conducta,
        anios_servicio_anterior: relacionActual.anios_servicio_anterior,
        categoria_viatico: relacionActual.categoria_viatico,
        usa_fonasa: relacionActual.usa_fonasa,
      },
    });

    // El cierre va sobre la relación vieja y el alta sobre la nueva.
    await tx.movimientos_laborales.createMany({
      data: [
        {
          relacion_laboral_id: relacionActual.id,
          tipo_movimiento_id: tipoCierre.id,
          fecha_movimiento: params.fecha_ascenso,
          usuario_id: params.usuario_id ?? null,
          observaciones: params.observaciones ?? null,
        },
        {
          relacion_laboral_id: relacionNueva.id,
          tipo_movimiento_id: tipoAscenso.id,
          fecha_movimiento: params.fecha_ascenso,
          usuario_id: params.usuario_id ?? null,
          observaciones: params.observaciones ?? null,
        },
      ],
    });

    const ascenso = await tx.ascensos.create({
      data: {
        persona_id: params.persona_id,
        grado_id: gradoDestino.id,
        grado_anterior_id: gradoActual?.id ?? null,
        fecha_ascenso: params.fecha_ascenso,
        observaciones: params.observaciones ?? null,
        numero_orden: params.numero_orden ?? null,
        orden_ascenso_id: params.orden_ascenso_id ?? null,
        relacion_laboral_anterior_id: relacionActual.id,
        relacion_laboral_nueva_id: relacionNueva.id,
        regla_id: params.regla_id ?? null,
        cumplia_requisitos: params.cumplia_requisitos ?? null,
        evaluacion: params.evaluacion ?? Prisma.DbNull,
        motivo_excepcion: params.motivo_excepcion ?? null,
        registrado_por: params.usuario_id ?? null,
      },
    });

    return {
      ascenso,
      relacion_anterior_id: relacionActual.id,
      relacion_nueva_id: relacionNueva.id,
      grado_anterior: gradoActual,
      grado_nuevo: gradoDestino,
    };
  }

  async anular(ascensoId: bigint, params: AnularAscensoParams) {
    return this.prisma.$transaction((tx) =>
      this.anularEnTransaccion(tx, ascensoId, params),
    );
  }

  /**
   * Borra los dos movimientos, elimina la relación que se abrió y reactiva la
   * anterior. Solo si esa relación sigue siendo la vigente del funcionario: con
   * un movimiento posterior, revertir dejaría la nómina inconsistente.
   */
  async anularEnTransaccion(
    tx: Prisma.TransactionClient,
    ascensoId: bigint,
    params: AnularAscensoParams,
  ) {
    if (!params.motivo?.trim()) {
      throw new BadRequestException('Anular un ascenso necesita un motivo escrito');
    }

    const ascenso = await tx.ascensos.findUnique({ where: { id: ascensoId } });
    if (!ascenso) throw new NotFoundException(`No existe el ascenso ${ascensoId}`);
    if (ascenso.anulado_en) {
      throw new ConflictException(`El ascenso ${ascensoId} ya está anulado`);
    }
    if (!ascenso.relacion_laboral_nueva_id || !ascenso.relacion_laboral_anterior_id) {
      throw new BadRequestException(
        `El ascenso ${ascensoId} es un registro histórico sin relaciones laborales asociadas: no se puede revertir automáticamente`,
      );
    }

    const relacionNueva = await tx.relaciones_laborales.findUnique({
      where: { id: ascenso.relacion_laboral_nueva_id },
      select: { id: true, persona_id: true, fecha_fin: true },
    });
    if (!relacionNueva) {
      throw new BadRequestException(
        `La relación laboral que abrió el ascenso ${ascensoId} ya no existe`,
      );
    }
    if (relacionNueva.fecha_fin !== null) {
      throw new ConflictException(
        'El funcionario tuvo un movimiento posterior a este ascenso. Anulá primero el movimiento más reciente.',
      );
    }

    const posteriores = await tx.relaciones_laborales.count({
      where: {
        persona_id: relacionNueva.persona_id,
        fecha_fin: null,
        id: { not: relacionNueva.id },
      },
    });
    if (posteriores > 0) {
      throw new ConflictException(
        'El funcionario tiene otra relación laboral vigente. Revisá su historial antes de anular.',
      );
    }

    // Revertir una relación ya liquidada dejaría sueldos pagos apuntando a una
    // fila borrada.
    const itemsLiquidados = await tx.items_liquidacion.count({
      where: { relacion_laboral_id: relacionNueva.id },
    });
    if (itemsLiquidados > 0) {
      throw new ConflictException(
        'El ascenso ya fue liquidado: la relación laboral que abrió tiene items de liquidación. Hay que coordinarlo con el equipo de liquidación.',
      );
    }

    await tx.movimientos_laborales.deleteMany({
      where: {
        relacion_laboral_id: {
          in: [ascenso.relacion_laboral_anterior_id, relacionNueva.id],
        },
        fecha_movimiento: ascenso.fecha_ascenso ?? undefined,
      },
    });

    // `ascensos` referencia la relación por foreign key: hay que soltarla antes
    // de borrar, o Postgres no deja.
    await tx.ascensos.updateMany({
      where: { relacion_laboral_nueva_id: relacionNueva.id },
      data: { relacion_laboral_nueva_id: null },
    });
    await tx.ascensos.updateMany({
      where: { relacion_laboral_anterior_id: relacionNueva.id },
      data: { relacion_laboral_anterior_id: null },
    });

    await tx.relaciones_laborales.delete({ where: { id: relacionNueva.id } });

    await tx.relaciones_laborales.update({
      where: { id: ascenso.relacion_laboral_anterior_id },
      data: { fecha_fin: null, estado: ESTADO_RELACION_ACTIVA },
    });

    return tx.ascensos.update({
      where: { id: ascensoId },
      data: {
        anulado_en: new Date(),
        anulado_por: params.usuario_id ?? null,
        motivo_anulacion: params.motivo,
      },
    });
  }

  /** Por nombre y nunca por id: el catálogo es del otro equipo. */
  private async tipoMovimientoPorNombre(tx: Prisma.TransactionClient, nombre: string) {
    const tipo = await tx.tipos_movimiento.findUnique({
      where: { nombre },
      select: { id: true, nombre: true },
    });
    if (!tipo) {
      throw new BadRequestException(
        `Falta el tipo de movimiento "${nombre}" en el catálogo: no se puede registrar el ascenso`,
      );
    }
    return tipo;
  }
}

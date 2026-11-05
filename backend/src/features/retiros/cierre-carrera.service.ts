import { forwardRef, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import { RetirosService } from './retiros.service';
import { DerechaService } from '../derecha/derecha.service';

export type CierresElegidos = {
  destino: boolean;
  inscripciones: number[];
  comisiones?: number[];
  usuario: boolean;
};

export type ResultadoCierre = {
  retiroId: bigint;
  cerrado: {
    destino: string | null;
    inscripciones: string[];
    comisiones: string[];
    usuario: string | null;
  };
};

export type ParamsCierre = {
  personaId: number;
  fechaRetiro: Date;
  horaRetiro?: string | null;
  motivoBajaId: number;
  motivo?: string | null;
  numeroOrden?: string | null;
  boletin?: string | null;
  observaciones?: string | null;
  autorId: bigint;
  cierres: CierresElegidos;
  forzarCascada?: boolean;
};

// Los únicos motivos que el sistema de liquidaciones clasifica como "Retiro". 
const MOTIVOS_DE_RETIRO = ['RETIRO_OBL', 'RETIRO_VOL'];

@Injectable()
export class CierreCarreraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    @Inject(forwardRef(() => RetirosService))
    private readonly retiros: RetirosService,
    private readonly derecha: DerechaService,
  ) {}

  async cerrar(params: ParamsCierre): Promise<ResultadoCierre> {
    const impacto = await this.retiros.calcularImpacto(params.personaId, params.fechaRetiro);

    if (impacto.bloqueos.length > 0) {
      throw new UnprocessableEntityException(impacto.bloqueos.join(' '));
    }

    const motivoBaja = await this.prisma.motivos_baja.findUnique({
      where: { id: BigInt(params.motivoBajaId) },
      select: { id: true, codigo: true, vigente: true },
    });
    if (!motivoBaja || !motivoBaja.vigente) {
      throw new UnprocessableEntityException('Motivo de baja no encontrado o no vigente');
    }

    const nombreTipo = MOTIVOS_DE_RETIRO.includes(motivoBaja.codigo) ? 'Retiro' : 'Baja';
    const tipoMovimiento = await this.prisma.tipos_movimiento.findFirst({
      where: { nombre: nombreTipo, es_alta: false },
    });
    if (!tipoMovimiento) {
      throw new UnprocessableEntityException(
        `Tipo de movimiento '${nombreTipo}' no encontrado en el catálogo`,
      );
    }

    const forzar = params.forzarCascada === true;
    const idsValidos = impacto.inscripciones.map((c: any) => c.id.toString());
    const pedidas = (params.cierres.inscripciones ?? []).map(String);
    const invalidas = pedidas.filter((id) => !idsValidos.includes(id));
    if (invalidas.length > 0) {
      throw new UnprocessableEntityException(
        `Inscripciones inválidas para este funcionario: ${invalidas.join(', ')}`,
      );
    }

    const comisionesValidas = impacto.comisiones.map((a: any) => a.id.toString());
    const comisionesPedidas = (params.cierres.comisiones ?? []).map(String);
    const comisionesInvalidas = comisionesPedidas.filter((id) => !comisionesValidas.includes(id));
    if (comisionesInvalidas.length > 0) {
      throw new UnprocessableEntityException(
        `Pertenencias a comisiones inválidas para este funcionario: ${comisionesInvalidas.join(', ')}`,
      );
    }
    const comisionesACerrar = impacto.comisiones.filter((a: any) =>
      (forzar ? comisionesValidas : comisionesPedidas).includes(a.id.toString()),
    );

    const cerrarDestino = (forzar || params.cierres.destino) && impacto.destino != null;
    const cerrarUsuario = (forzar || params.cierres.usuario) && impacto.usuario != null;
    const inscripcionesACerrar = forzar ? idsValidos : pedidas;

    const resultado = await this.prisma.$transaction(async (tx: any) => {
      await tx.relaciones_laborales.update({
        where: { id: impacto.relacion.id },
        data: {
          estado: 'inactivo',
          fecha_fin: params.fechaRetiro,
          motivo_baja_id: motivoBaja.id,
          fecha_actualizacion: new Date(),
        },
      });

      // Así las dos puertas de un fallecimiento dejan el mismo estado: la de PATCH /personas ya la cargó.
      if (motivoBaja.codigo === 'FALLECIMIENTO') {
        await tx.personas.updateMany({
          where: { id: BigInt(params.personaId), fecha_fallecimiento: null },
          data: { fecha_fallecimiento: params.fechaRetiro },
        });
      }

      await this.derecha.quitarPorInactividadEnTransaccion(tx, BigInt(params.personaId), {
        motivo: params.motivo ?? nombreTipo,
        usuarioId: params.autorId,
      });

      const movimiento = await tx.movimientos_laborales.create({
        data: {
          relacion_laboral_id: impacto.relacion.id,
          tipo_movimiento_id: tipoMovimiento.id,
          fecha_movimiento: params.fechaRetiro,
          usuario_id: params.autorId,
          observaciones: params.observaciones ?? null,
        },
      });

      if (cerrarDestino) {
        await tx.destinos.update({
          where: { id: impacto.destino.id },
          data: { fecha_fin: params.fechaRetiro },
        });
      }

      if (inscripcionesACerrar.length > 0) {
        await tx.funcionarios_cursos.updateMany({
          where: { id: { in: inscripcionesACerrar.map((id) => BigInt(id)) } },
          data: {
            dado_de_baja: true,
            motivo_baja: 'Retiro del funcionario',
            fecha_baja: new Date(),
            dado_de_baja_por: params.autorId,
          },
        });
      }

      for (const a of comisionesACerrar) {
        await tx.asignaciones_comision.update({
          where: { id: a.id },
          data: { fecha_fin: params.fechaRetiro },
        });
      }

      if (cerrarUsuario) {
        // El CHECK de usuarios no admite 'inactivo'.
        await tx.usuarios.update({
          where: { id: impacto.usuario.id },
          data: { estado: 'bloqueado' },
        });
      }

      const cerrado = {
        destino: cerrarDestino ? impacto.destino.id.toString() : null,
        inscripciones: inscripcionesACerrar,
        comisiones: comisionesACerrar.map((a: any) => a.id.toString()),
        usuario: cerrarUsuario ? impacto.usuario.id.toString() : null,
      };

      const retiro = await tx.retiros.create({
        data: {
          persona_id: BigInt(params.personaId),
          relacion_laboral_id: impacto.relacion.id,
          fecha_retiro: params.fechaRetiro,
          hora_retiro: params.horaRetiro ? new Date(`1970-01-01T${params.horaRetiro}Z`) : null,
          motivo_baja_id: motivoBaja.id,
          motivo: params.motivo ?? null,
          numero_orden: params.numeroOrden ?? null,
          boletin: params.boletin ?? null,
          observaciones: params.observaciones ?? null,
          movimiento_laboral_id: movimiento.id,
          cierres_aplicados: {
            destino_id: cerrado.destino,
            inscripciones_ids: cerrado.inscripciones,
            // Con la fecha_fin que tenían, para que anular el retiro las deje como estaban.
            comisiones: comisionesACerrar.map((a: any) => ({
              id: a.id.toString(),
              fecha_fin_anterior: a.fecha_fin ? a.fecha_fin.toISOString().split('T')[0] : null,
            })),
            usuario_id: cerrado.usuario,
          },
          registrado_por: params.autorId,
        },
      });

      return { retiroId: retiro.id, cerrado };
    });

    // Fuera de la transacción: SesionesService usa otra conexión y actualizar la
    // misma fila de usuarios que la transacción tiene bloqueada la trabaría
    // hasta que expire.
    if (resultado.cerrado.usuario) {
      await this.sesiones.invalidarUsuario(BigInt(resultado.cerrado.usuario));
    }

    return resultado;
  }
}

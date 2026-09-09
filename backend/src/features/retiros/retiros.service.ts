import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { ListRetirosQueryDto } from './dto/list-retiros-query.dto';
import { CreateRetiroDto } from './dto/create-retiro.dto';
import { UpdateRetiroDto } from './dto/update-retiro.dto';
import { AnularRetiroDto } from './dto/anular-retiro.dto';
import { CierreCarreraService } from './cierre-carrera.service';

export type Impacto = {
  persona: any;
  relacion: any;
  destino: any;
  inscripciones: any[];
  usuario: any;
  vivienda: any;
  bloqueos: string[];
};

export const soloFecha = (fecha: Date | null) =>
  fecha ? fecha.toISOString().split('T')[0] : null;

export const soloHora = (hora: Date | null) =>
  hora ? hora.toISOString().split('T')[1].slice(0, 8) : null;

@Injectable()
export class RetirosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CierreCarreraService))
    private readonly cierre: CierreCarreraService,
  ) {}

  protected readonly includeFila = {
    personas: {
      select: {
        id: true,
        cedula: true,
        primer_nombre: true,
        primer_apellido: true,
        relaciones_laborales: {
          where: { estado: 'activo' },
          select: { id: true },
          take: 1,
        },
      },
    },
    motivos_baja: { select: { id: true, codigo: true, denominacion: true } },
    relaciones_laborales: {
      select: {
        id: true,
        estado: true,
        fecha_inicio: true,
        fecha_fin: true,
        unidades: { select: { id: true, codigo: true, denominacion: true } },
        grados: { select: { id: true, codigo: true, denominacion: true } },
      },
    },
  };

  protected mapFila(r: any) {
    return {
      id: r.id.toString(),
      persona: {
        id: r.personas.id.toString(),
        cedula: r.personas.cedula,
        primer_nombre: r.personas.primer_nombre,
        primer_apellido: r.personas.primer_apellido,
      },
      grado: r.relaciones_laborales?.grados
        ? {
            id: r.relaciones_laborales.grados.id.toString(),
            denominacion: r.relaciones_laborales.grados.denominacion,
          }
        : null,
      unidad: r.relaciones_laborales?.unidades
        ? {
            id: r.relaciones_laborales.unidades.id.toString(),
            denominacion: r.relaciones_laborales.unidades.denominacion,
          }
        : null,
      fecha_retiro: soloFecha(r.fecha_retiro),
      hora_retiro: soloHora(r.hora_retiro),
      motivo_baja: { codigo: r.motivos_baja.codigo, denominacion: r.motivos_baja.denominacion },
      motivo: r.motivo,
      anulado: r.anulado,
      // Un retiro sigue en pie mientras la persona no haya vuelto al servicio.
      // Mirar la relación que cerró no sirve: queda inactiva para siempre.
      vigente: !r.anulado && (r.personas?.relaciones_laborales?.length ?? 0) === 0,
    };
  }

  async listar(query: ListRetirosQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const rangoFecha =
      query.desde || query.hasta
        ? {
            ...(query.desde ? { gte: new Date(query.desde) } : {}),
            ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
          }
        : undefined;

    const relacionWhere: Record<string, unknown> = {};
    if (query.unidad_id) relacionWhere.unidad_id = BigInt(query.unidad_id);

    // "Los retirados" son las personas sin relación activa. Filtrar por el
    // estado de la relación cerrada dejaría dentro a los reincorporados.
    const filtroVigentes =
      (query.vigentes ?? true)
        ? { personas: { relaciones_laborales: { none: { estado: 'activo' } } } }
        : {};

    const where: any = {
      ...(query.incluir_anulados ? {} : { anulado: false }),
      ...(rangoFecha ? { fecha_retiro: rangoFecha } : {}),
      ...(query.motivo_baja_id ? { motivo_baja_id: BigInt(query.motivo_baja_id) } : {}),
      ...(query.query
        ? {
            personas: {
              OR: [
                { cedula: { contains: query.query, mode: 'insensitive' as const } },
                { primer_nombre: { contains: query.query, mode: 'insensitive' as const } },
                { primer_apellido: { contains: query.query, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    if (Object.keys(relacionWhere).length > 0) where.relaciones_laborales = relacionWhere;

    if (filtroVigentes.personas) {
      where.personas = { ...(where.personas ?? {}), ...filtroVigentes.personas };
    }

    const [items, total] = await Promise.all([
      this.prisma.retiros.findMany({
        where,
        include: this.includeFila,
        orderBy: { fecha_retiro: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.retiros.count({ where }),
    ]);

    return { items: items.map((r) => this.mapFila(r)), total, page, pageSize };
  }
  /**
   * Simula el retiro a una fecha dada. No escribe. La usa la previa y también el
   * POST, que la recalcula antes de confirmar.
   */
  async calcularImpacto(personaId: number, fecha: Date): Promise<Impacto> {
    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(personaId) },
      select: {
        id: true,
        cedula: true,
        primer_nombre: true,
        primer_apellido: true,
        es_civil: true,
        fecha_fallecimiento: true,
      },
    });
    if (!persona) throw new NotFoundException('Persona no encontrada');

    const relacion = await this.prisma.relaciones_laborales.findFirst({
      where: { persona_id: BigInt(personaId), estado: 'activo' },
      select: {
        id: true,
        estado: true,
        fecha_inicio: true,
        tipo_funcionario: true,
        situacion_id: true,
        grado_id: true,
        unidad_id: true,
        unidades: { select: { id: true, codigo: true, denominacion: true } },
        situaciones: { select: { id: true, codigo: true, denominacion: true } },
      },
    });

    const bloqueos: string[] = [];

    if (persona.es_civil) {
      bloqueos.push('El funcionario es civil: la baja de civiles todavía no está soportada.');
    }

    if (!relacion) {
      // Sin relación activa hay dos casos distintos, y al operador le sirve
      // saber cuál: ya está retirado, o nunca tuvo vínculo laboral.
      const retiroPrevio = await this.prisma.retiros.findFirst({
        where: { persona_id: BigInt(personaId), anulado: false },
      });
      bloqueos.push(
        retiroPrevio
          ? 'El funcionario ya está retirado.'
          : 'El funcionario no tiene relación laboral activa.',
      );
    }

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    if (fecha > hoy) {
      bloqueos.push('La fecha de retiro no puede ser futura.');
    }
    if (relacion && fecha < relacion.fecha_inicio) {
      bloqueos.push('La fecha de retiro es anterior al inicio de la relación laboral.');
    }

    if (relacion) {
      const ultimoMovimiento = await this.prisma.movimientos_laborales.findFirst({
        where: { relacion_laboral_id: relacion.id },
        orderBy: { fecha_movimiento: 'desc' },
        select: { fecha_movimiento: true },
      });
      if (ultimoMovimiento && fecha < ultimoMovimiento.fecha_movimiento) {
        bloqueos.push('La fecha de retiro es anterior al último movimiento registrado.');
      }
    }

    const [destino, inscripciones, usuario, vivienda] = await Promise.all([
      this.prisma.destinos.findFirst({
        where: {
          persona_id: BigInt(personaId),
          OR: [{ fecha_fin: null }, { fecha_fin: { gte: fecha } }],
        },
        select: {
          id: true,
          unidad_id: true,
          fecha_inicio: true,
          fecha_fin: true,
          unidades: { select: { id: true, codigo: true, denominacion: true } },
        },
      }),
      this.prisma.funcionarios_cursos.findMany({
        where: {
          persona_id: BigInt(personaId),
          dado_de_baja: false,
          OR: [{ fecha_fin: null }, { fecha_fin: { gte: fecha } }],
        },
        select: {
          id: true,
          fecha_inicio: true,
          fecha_fin: true,
          cursos: { select: { id: true, nombre_curso: true } },
        },
      }),
      this.prisma.usuarios.findFirst({
        where: { persona_id: BigInt(personaId), estado: 'activo' },
        select: { id: true, username: true, estado: true },
      }),
      this.prisma.ocupaciones_vivienda.findFirst({
        where: {
          persona_id: BigInt(personaId),
          OR: [{ fecha_fin: null }, { fecha_fin: { gte: fecha } }],
        },
        select: { vivienda_id: true, fecha_inicio: true },
      }),
    ]);

    return { persona, relacion, destino, inscripciones, usuario, vivienda, bloqueos };
  }

  async previa(personaId: number, fechaRetiro: string) {
    const i = await this.calcularImpacto(personaId, new Date(fechaRetiro));

    return {
      persona: {
        id: i.persona.id.toString(),
        cedula: i.persona.cedula,
        primer_nombre: i.persona.primer_nombre,
        primer_apellido: i.persona.primer_apellido,
      },
      relacion_laboral: i.relacion
        ? {
            id: i.relacion.id.toString(),
            fecha_inicio: soloFecha(i.relacion.fecha_inicio),
            tipo_funcionario: i.relacion.tipo_funcionario,
            unidad: i.relacion.unidades
              ? {
                  id: i.relacion.unidades.id.toString(),
                  denominacion: i.relacion.unidades.denominacion,
                }
              : null,
            situacion: i.relacion.situaciones
              ? { id: i.relacion.situaciones.id.toString(), codigo: i.relacion.situaciones.codigo }
              : null,
          }
        : null,
      destino_vigente: i.destino
        ? {
            id: i.destino.id.toString(),
            unidad: i.destino.unidades
              ? {
                  id: i.destino.unidades.id.toString(),
                  denominacion: i.destino.unidades.denominacion,
                }
              : null,
            fecha_inicio: soloFecha(i.destino.fecha_inicio),
            cerrar_sugerido: true,
          }
        : null,
      inscripciones_activas: i.inscripciones.map((c: any) => ({
        id: c.id.toString(),
        curso: { id: c.cursos.id.toString(), nombre_curso: c.cursos.nombre_curso },
        fecha_inicio: soloFecha(c.fecha_inicio),
        cerrar_sugerido: true,
      })),
      usuario: i.usuario
        ? { id: i.usuario.id.toString(), username: i.usuario.username, cerrar_sugerido: true }
        : null,
      vivienda: i.vivienda
        ? { vivienda_id: i.vivienda.vivienda_id.toString(), informativo: true }
        : null,
      bloqueos: i.bloqueos,
    };
  }

  async registrar(dto: CreateRetiroDto, autorId: bigint) {
    const cierres = dto.cerrar
      ? {
          destino: dto.cerrar.destino ?? true,
          inscripciones: dto.cerrar.inscripciones ?? [],
          usuario: dto.cerrar.usuario ?? true,
        }
      : { destino: true, inscripciones: [], usuario: true };

    const { retiroId, cerrado } = await this.cierre.cerrar({
      personaId: dto.persona_id,
      fechaRetiro: new Date(dto.fecha_retiro),
      horaRetiro: dto.hora_retiro ?? null,
      motivoBajaId: dto.motivo_baja_id,
      motivo: dto.motivo ?? null,
      numeroOrden: dto.numero_orden ?? null,
      boletin: dto.boletin ?? null,
      observaciones: dto.observaciones ?? null,
      autorId,
      cierres,
      forzarCascada: dto.cerrar == null,
    });

    const retiro = await this.prisma.retiros.findUnique({
      where: { id: retiroId },
      include: this.includeFila,
    });

    return { ...this.mapFila(retiro), cerrado };
  }
  private readonly includeDetalle = {
    ...this.includeFila,
    movimientos_laborales: {
      select: {
        id: true,
        fecha_movimiento: true,
        tipos_movimiento: { select: { nombre: true } },
      },
    },
    usuarios_registro: { select: { id: true, username: true } },
    usuarios_anulacion: { select: { id: true, username: true } },
  };

  /** La relación laboral que empezó después del retiro, si la persona volvió. */
  private async buscarReincorporacion(r: any) {
    const posterior = await this.prisma.relaciones_laborales.findFirst({
      where: { persona_id: r.persona_id, fecha_inicio: { gt: r.fecha_retiro } },
      orderBy: { fecha_inicio: 'asc' },
      select: {
        id: true,
        fecha_inicio: true,
        situaciones: { select: { codigo: true, denominacion: true } },
      },
    });
    if (!posterior) return null;

    return {
      relacion_laboral_id: posterior.id.toString(),
      fecha: soloFecha(posterior.fecha_inicio),
      situacion: posterior.situaciones
        ? {
            codigo: posterior.situaciones.codigo,
            denominacion: posterior.situaciones.denominacion,
          }
        : null,
    };
  }

  async obtener(retiroId: number) {
    const r = await this.prisma.retiros.findUnique({
      where: { id: BigInt(retiroId) },
      include: this.includeDetalle,
    });
    if (!r) throw new NotFoundException('Retiro no encontrado');

    return {
      ...this.mapFila(r),
      numero_orden: r.numero_orden,
      boletin: r.boletin,
      observaciones: r.observaciones,
      relacion_laboral_cerrada: r.relaciones_laborales
        ? {
            id: r.relaciones_laborales.id.toString(),
            fecha_inicio: soloFecha(r.relaciones_laborales.fecha_inicio),
            fecha_fin: soloFecha(r.relaciones_laborales.fecha_fin),
            unidad: r.relaciones_laborales.unidades
              ? {
                  id: r.relaciones_laborales.unidades.id.toString(),
                  denominacion: r.relaciones_laborales.unidades.denominacion,
                }
              : null,
            grado: r.relaciones_laborales.grados
              ? {
                  id: r.relaciones_laborales.grados.id.toString(),
                  denominacion: r.relaciones_laborales.grados.denominacion,
                }
              : null,
          }
        : null,
      movimiento: r.movimientos_laborales
        ? {
            id: r.movimientos_laborales.id.toString(),
            tipo: r.movimientos_laborales.tipos_movimiento?.nombre ?? null,
            fecha: soloFecha(r.movimientos_laborales.fecha_movimiento),
          }
        : null,
      cerrado_con_el_retiro: r.cierres_aplicados,
      registrado_por: r.usuarios_registro
        ? { id: r.usuarios_registro.id.toString(), username: r.usuarios_registro.username }
        : null,
      registrado_en: r.registrado_en?.toISOString() ?? null,
      anulacion: r.anulado
        ? {
            motivo: r.motivo_anulacion,
            fecha: r.fecha_anulacion?.toISOString() ?? null,
            por: r.usuarios_anulacion
              ? { id: r.usuarios_anulacion.id.toString(), username: r.usuarios_anulacion.username }
              : null,
          }
        : null,
      reincorporacion: await this.buscarReincorporacion(r),
    };
  }
  async corregir(retiroId: number, dto: UpdateRetiroDto) {
    const retiro = await this.prisma.retiros.findUnique({ where: { id: BigInt(retiroId) } });
    if (!retiro) throw new NotFoundException('Retiro no encontrado');
    if (retiro.anulado) throw new ConflictException('El retiro está anulado: no se puede corregir');

    if (dto.motivo_baja_id != null) {
      const motivo = await this.prisma.motivos_baja.findUnique({
        where: { id: BigInt(dto.motivo_baja_id) },
        select: { id: true, vigente: true },
      });
      if (!motivo || !motivo.vigente) {
        throw new UnprocessableEntityException('Motivo de baja no encontrado o no vigente');
      }
    }

    const data: any = {
      ...(dto.motivo !== undefined && { motivo: dto.motivo }),
      ...(dto.numero_orden !== undefined && { numero_orden: dto.numero_orden }),
      ...(dto.boletin !== undefined && { boletin: dto.boletin }),
      ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
      ...(dto.motivo_baja_id !== undefined && { motivo_baja_id: BigInt(dto.motivo_baja_id) }),
      ...(dto.hora_retiro !== undefined && {
        hora_retiro: new Date(`1970-01-01T${dto.hora_retiro}Z`),
      }),
      ...(dto.fecha_retiro !== undefined && { fecha_retiro: new Date(dto.fecha_retiro) }),
    };

    await this.prisma.$transaction(async (tx: any) => {
      await tx.retiros.update({ where: { id: BigInt(retiroId) }, data });

      if (dto.fecha_retiro !== undefined) {
        await tx.relaciones_laborales.update({
          where: { id: retiro.relacion_laboral_id },
          data: { fecha_fin: new Date(dto.fecha_retiro), fecha_actualizacion: new Date() },
        });
      }
    });

    // Fuera de la transacción: obtener usa otra conexión y no vería los cambios
    // sin commitear.
    return this.obtener(retiroId);
  }
  async anular(retiroId: number, dto: AnularRetiroDto, autorId: bigint) {
    const retiro = await this.prisma.retiros.findUnique({ where: { id: BigInt(retiroId) } });
    if (!retiro) throw new NotFoundException('Retiro no encontrado');
    if (retiro.anulado) throw new ConflictException('El retiro ya está anulado');

    const cierres = (retiro.cierres_aplicados ?? {}) as {
      destino_id?: string | null;
      inscripciones_ids?: string[];
      usuario_id?: string | null;
    };

    return this.prisma.$transaction(async (tx: any) => {
      await tx.relaciones_laborales.update({
        where: { id: retiro.relacion_laboral_id },
        data: {
          estado: 'activo',
          fecha_fin: null,
          motivo_baja_id: null,
          fecha_actualizacion: new Date(),
        },
      });

      // Soltar el movimiento en el mismo update que marca la anulación: la FK
      // retiros_movimiento_laboral_id_fkey impide borrarlo mientras lo apunte.
      await tx.retiros.update({
        where: { id: BigInt(retiroId) },
        data: {
          anulado: true,
          motivo_anulacion: dto.motivo_anulacion,
          fecha_anulacion: new Date(),
          anulado_por: autorId,
          movimiento_laboral_id: null,
        },
      });

      if (retiro.movimiento_laboral_id) {
        await tx.movimientos_laborales.delete({ where: { id: retiro.movimiento_laboral_id } });
      }

      if (cierres.destino_id) {
        await tx.destinos.update({
          where: { id: BigInt(cierres.destino_id) },
          data: { fecha_fin: null },
        });
      }

      if (cierres.inscripciones_ids?.length) {
        await tx.funcionarios_cursos.updateMany({
          where: { id: { in: cierres.inscripciones_ids.map((id) => BigInt(id)) } },
          data: { dado_de_baja: false, motivo_baja: null, fecha_baja: null, dado_de_baja_por: null },
        });
      }

      if (cierres.usuario_id) {
        await tx.usuarios.update({
          where: { id: BigInt(cierres.usuario_id) },
          data: { estado: 'activo' },
        });
      }

      return {
        id: retiroId.toString(),
        revertido: {
          relacion_laboral: retiro.relacion_laboral_id.toString(),
          movimiento_borrado: retiro.movimiento_laboral_id?.toString() ?? null,
          destino: cierres.destino_id ?? null,
          inscripciones: cierres.inscripciones_ids ?? [],
          usuario: cierres.usuario_id ?? null,
        },
      };
    });
  }
}

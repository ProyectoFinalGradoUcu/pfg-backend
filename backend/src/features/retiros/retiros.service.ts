import {
  BadRequestException,
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
import { ReincorporarDto } from './dto/reincorporar.dto';
import { ActualizarReincorporacionDto } from './dto/actualizar-reincorporacion.dto';
import { CierreCarreraService } from './cierre-carrera.service';
import { DerechaService } from '../derecha/derecha.service';

export type Impacto = {
  persona: any;
  relacion: any;
  destino: any;
  inscripciones: any[];
  comisiones: any[];
  usuario: any;
  vivienda: any;
  bloqueos: string[];
};

export const soloFecha = (fecha: Date | null) =>
  fecha ? fecha.toISOString().split('T')[0] : null;

export const soloHora = (hora: Date | null) =>
  hora ? hora.toISOString().split('T')[1].slice(0, 8) : null;

const diaAnterior = (fecha: Date) => new Date(fecha.getTime() - 86_400_000);

const SITUACION_REINCORPORADO = { oficial: 'SIT16', subalterno: 'SIT17' } as const;

const CODIGOS_REINCORPORADO: (string | undefined)[] = Object.values(SITUACION_REINCORPORADO);

const MOTIVO_ANULACION_REINCORPORACION = 'Anulación de reincorporación';

type Categoria = keyof typeof SITUACION_REINCORPORADO;

// Cadetes, aprendices y At. 3.ª no se reincorporan: ningún reincorporado histórico de la FAU los tiene.
const gradoNoReincorporable = (codigo?: string) =>
  !!codigo?.startsWith('CAD') || codigo === 'AT_3RA' || codigo === 'APRENDIZ';

// El catálogo de liquidación no marca a los aerotécnicos ni como oficiales ni como subalternos.
const gradoCorresponde = (grado: { es_oficial: boolean }, categoria: Categoria) =>
  categoria === 'oficial' ? grado.es_oficial : !grado.es_oficial;

// La previa ofrece exactamente lo que después aceptan el POST y el PATCH.
const gradoAdmitido = (grado: { codigo: string; es_oficial: boolean }, categoria: Categoria) =>
  !gradoNoReincorporable(grado.codigo) && gradoCorresponde(grado, categoria);

const validarParCalculo = (dto: { haber_retiro?: number; porcentaje_progresivo?: number }) => {
  if ((dto.haber_retiro == null) !== (dto.porcentaje_progresivo == null)) {
    throw new UnprocessableEntityException(
      'El haber de retiro y el porcentaje progresivo van juntos: cargá los dos o ninguno',
    );
  }
};

const ref = (x: { id: bigint; denominacion: string } | null) =>
  x ? { id: x.id.toString(), denominacion: x.denominacion } : null;

@Injectable()
export class RetirosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CierreCarreraService))
    private readonly cierre: CierreCarreraService,
    private readonly derecha: DerechaService,
  ) {}

  protected readonly includeFila = {
    personas: {
      select: {
        id: true,
        cedula: true,
        primer_nombre: true,
        primer_apellido: true,
        relaciones_laborales: { select: { estado: true, fecha_inicio: true } },
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
        sub_unidades: { select: { id: true, codigo: true, denominacion: true } },
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
      sub_unidad: r.relaciones_laborales?.sub_unidades
        ? {
            id: r.relaciones_laborales.sub_unidades.id.toString(),
            denominacion: r.relaciones_laborales.sub_unidades.denominacion,
          }
        : null,
      fecha_retiro: soloFecha(r.fecha_retiro),
      hora_retiro: soloHora(r.hora_retiro),
      motivo_baja: { codigo: r.motivos_baja.codigo, denominacion: r.motivos_baja.denominacion },
      motivo: r.motivo,
      anulado: r.anulado,
      // En pie mientras nadie volvió a entrar después: mirar solo si hoy hay relación activa dejaba
      // vigente el retiro viejo de alguien que se reincorporó y se volvió a retirar.
      vigente:
        !r.anulado &&
        !(r.personas?.relaciones_laborales ?? []).some(
          (rel: any) => rel.estado === 'activo' || rel.fecha_inicio > r.fecha_retiro,
        ),
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
    if (query.categoria) relacionWhere.tipo_funcionario = query.categoria;

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

    // Comparar cada retiro con las relaciones de su persona no se puede escribir en un where de Prisma.
    if (query.vigentes ?? true) {
      const vigentes = await this.prisma.$queryRaw<{ id: bigint }[]>`
        SELECT r.id FROM retiros r
        WHERE NOT r.anulado
          AND NOT EXISTS (
            SELECT 1 FROM relaciones_laborales rl
            WHERE rl.persona_id = r.persona_id
              AND (rl.estado = 'activo' OR rl.fecha_inicio > r.fecha_retiro)
          )`;
      where.id = { in: vigentes.map((v) => v.id) };
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
        sub_unidades: { select: { id: true, codigo: true, denominacion: true } },
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

    const [destino, inscripciones, comisiones, usuario, vivienda] = await Promise.all([
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
          sub_unidades: { select: { id: true, codigo: true, denominacion: true } },
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
      // Las que siguen abiertas, o terminan después, a la fecha del retiro. Una que empieza después no
      // se puede cerrar en esa fecha (fecha_fin >= fecha_inicio).
      this.prisma.asignaciones_comision.findMany({
        where: {
          persona_id: BigInt(personaId),
          fecha_inicio: { lte: fecha },
          OR: [{ fecha_fin: null }, { fecha_fin: { gt: fecha } }],
        },
        orderBy: { fecha_inicio: 'asc' },
        select: {
          id: true,
          cargo: true,
          fecha_inicio: true,
          fecha_fin: true,
          comisiones: { select: { id: true, denominacion: true } },
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

    return { persona, relacion, destino, inscripciones, comisiones, usuario, vivienda, bloqueos };
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
            sub_unidad: i.relacion.sub_unidades
              ? {
                  id: i.relacion.sub_unidades.id.toString(),
                  denominacion: i.relacion.sub_unidades.denominacion,
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
            sub_unidad: i.destino.sub_unidades
              ? {
                  id: i.destino.sub_unidades.id.toString(),
                  denominacion: i.destino.sub_unidades.denominacion,
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
      comisiones_abiertas: i.comisiones.map((a: any) => ({
        id: a.id.toString(),
        comision: { id: a.comisiones.id.toString(), denominacion: a.comisiones.denominacion },
        cargo: a.cargo,
        fecha_inicio: soloFecha(a.fecha_inicio),
        fecha_fin: soloFecha(a.fecha_fin),
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
          comisiones: dto.cerrar.comisiones ?? [],
          usuario: dto.cerrar.usuario ?? true,
        }
      : { destino: true, inscripciones: [], comisiones: [], usuario: true };

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

  /**
   * Las relaciones que empezaron después del retiro y antes del retiro siguiente. Con un ascenso de
   * por medio son varias: `actual` es la activa o, si ninguna lo está, la que cerró última.
   */
  private async relacionesDeLaReincorporacion(retiro: { persona_id: bigint; fecha_retiro: Date }) {
    const siguiente = await this.prisma.retiros.findFirst({
      where: { persona_id: retiro.persona_id, anulado: false, fecha_retiro: { gt: retiro.fecha_retiro } },
      orderBy: { fecha_retiro: 'asc' },
      select: { fecha_retiro: true },
    });
    const relaciones: any[] = await this.prisma.relaciones_laborales.findMany({
      where: {
        persona_id: retiro.persona_id,
        fecha_inicio: {
          gt: retiro.fecha_retiro,
          ...(siguiente ? { lte: siguiente.fecha_retiro } : {}),
        },
      },
      orderBy: [{ fecha_inicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        estado: true,
        fecha_inicio: true,
        fecha_fin: true,
        haber_retiro: true,
        porcentaje_progresivo: true,
        situaciones: { select: { codigo: true, denominacion: true } },
        grados_relaciones_laborales_grado_reincorporacion_idTogrados: {
          select: { id: true, denominacion: true },
        },
      },
    });
    if (relaciones.length === 0) return null;

    const actual =
      relaciones.find((rel) => rel.estado === 'activo') ??
      relaciones.reduce((a, b) =>
        (b.fecha_fin?.getTime() ?? 0) > (a.fecha_fin?.getTime() ?? 0) ? b : a,
      );
    return { primera: relaciones[0], actual };
  }

  private async buscarReincorporacion(r: any) {
    const relaciones = await this.relacionesDeLaReincorporacion(r);
    if (!relaciones) return null;
    const posterior = relaciones.actual;

    const activa = posterior.estado === 'activo';
    const esReincorporado = CODIGOS_REINCORPORADO.includes(posterior.situaciones?.codigo);
    const haber = posterior.haber_retiro == null ? null : Number(posterior.haber_retiro);
    const porcentaje =
      posterior.porcentaje_progresivo == null ? null : Number(posterior.porcentaje_progresivo);

    return {
      relacion_laboral_id: posterior.id.toString(),
      fecha: soloFecha(relaciones.primera.fecha_inicio),
      situacion: posterior.situaciones
        ? {
            codigo: posterior.situaciones.codigo,
            denominacion: posterior.situaciones.denominacion,
          }
        : null,
      activa,
      grado_reincorporacion: ref(posterior.grados_relaciones_laborales_grado_reincorporacion_idTogrados),
      haber_retiro: haber,
      porcentaje_progresivo: porcentaje,
      // Sin estos dos datos liquidación le paga el sueldo completo, sin descontar el haber de retiro.
      faltan_datos_de_calculo: activa && esReincorporado && (haber == null || porcentaje == null),
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
            sub_unidad: r.relaciones_laborales.sub_unidades
              ? {
                  id: r.relaciones_laborales.sub_unidades.id.toString(),
                  denominacion: r.relaciones_laborales.sub_unidades.denominacion,
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

    const fechaNueva = dto.fecha_retiro !== undefined ? new Date(dto.fecha_retiro) : null;
    if (fechaNueva) await this.validarFechaCorregida(retiro, fechaNueva);

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

      if (fechaNueva) {
        await tx.relaciones_laborales.update({
          where: { id: retiro.relacion_laboral_id },
          data: { fecha_fin: fechaNueva, fecha_actualizacion: new Date() },
        });
        // El movimiento del retiro tiene que decir la misma fecha que el retiro.
        if (retiro.movimiento_laboral_id) {
          await tx.movimientos_laborales.update({
            where: { id: retiro.movimiento_laboral_id },
            data: { fecha_movimiento: fechaNueva },
          });
        }
      }
    });

    // Fuera de la transacción: obtener usa otra conexión y no vería los cambios
    // sin commitear.
    return this.obtener(retiroId);
  }
  /**
   * La fecha corregida pasa a ser el fin de la relación que cerró el retiro: tiene que caer entre el
   * inicio de esa relación (y su último movimiento anterior al retiro) y el inicio de la relación
   * siguiente, si el funcionario se reincorporó. Mismas reglas que al registrar o reincorporar.
   */
  private async validarFechaCorregida(
    retiro: {
      persona_id: bigint;
      relacion_laboral_id: bigint;
      movimiento_laboral_id: bigint | null;
      fecha_retiro: Date;
    },
    fecha: Date,
  ) {
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    if (fecha > hoy) throw new BadRequestException('La fecha de retiro no puede ser futura');

    const [relacion, ultimoMovimiento, siguiente] = await Promise.all([
      this.prisma.relaciones_laborales.findUnique({
        where: { id: retiro.relacion_laboral_id },
        select: { fecha_inicio: true },
      }),
      this.prisma.movimientos_laborales.findFirst({
        where: {
          relacion_laboral_id: retiro.relacion_laboral_id,
          ...(retiro.movimiento_laboral_id ? { id: { not: retiro.movimiento_laboral_id } } : {}),
        },
        orderBy: { fecha_movimiento: 'desc' },
        select: { fecha_movimiento: true },
      }),
      this.prisma.relaciones_laborales.findFirst({
        where: {
          persona_id: retiro.persona_id,
          id: { not: retiro.relacion_laboral_id },
          fecha_inicio: { gt: retiro.fecha_retiro },
        },
        orderBy: { fecha_inicio: 'asc' },
        select: { fecha_inicio: true },
      }),
    ]);

    if (relacion && fecha < relacion.fecha_inicio) {
      throw new BadRequestException(
        `La fecha de retiro es anterior al inicio de la relación laboral que cierra (${soloFecha(relacion.fecha_inicio)})`,
      );
    }
    if (ultimoMovimiento && fecha < ultimoMovimiento.fecha_movimiento) {
      throw new BadRequestException(
        `La fecha de retiro es anterior al último movimiento registrado (${soloFecha(ultimoMovimiento.fecha_movimiento)})`,
      );
    }
    if (siguiente && fecha >= siguiente.fecha_inicio) {
      throw new BadRequestException(
        `La fecha de retiro tiene que ser anterior a la reincorporación (${soloFecha(siguiente.fecha_inicio)})`,
      );
    }
  }

  // El ascenso abre la relación nueva con la misma fecha_inicio: a igual inicio, manda la que termina después.
  private relacionPosterior(
    retiro: { persona_id: bigint; relacion_laboral_id: bigint; fecha_retiro: Date },
    fechaInicio: Date,
  ) {
    return this.prisma.relaciones_laborales.findFirst({
      where: {
        persona_id: retiro.persona_id,
        id: { not: retiro.relacion_laboral_id },
        OR: [
          { fecha_inicio: { gt: fechaInicio } },
          {
            fecha_inicio: fechaInicio,
            OR: [{ fecha_fin: null }, { fecha_fin: { gt: retiro.fecha_retiro } }],
          },
        ],
      },
      select: { id: true },
    });
  }

  async anular(retiroId: number, dto: AnularRetiroDto, autorId: bigint) {
    const retiro = await this.prisma.retiros.findUnique({
      where: { id: BigInt(retiroId) },
      include: {
        personas: {
          select: {
            fecha_fallecimiento: true,
            relaciones_laborales: {
              where: { estado: 'activo' },
              select: { id: true, fecha_inicio: true },
              take: 1,
            },
          },
        },
        relaciones_laborales: { select: { fecha_inicio: true } },
      },
    });
    if (!retiro) throw new NotFoundException('Retiro no encontrado');
    if (retiro.anulado) throw new ConflictException('El retiro ya está anulado');

    if (retiro.personas.fecha_fallecimiento) {
      throw new ConflictException(
        'El funcionario tiene fecha de fallecimiento: el retiro no se puede anular. Si la fecha se cargó por error, borrala primero',
      );
    }

    // Sin movimiento, el retiro no lo registró este módulo (importado o previo): no hay con qué revertirlo.
    const movimientoId = retiro.movimiento_laboral_id;
    if (!movimientoId) {
      throw new ConflictException(
        'El retiro es histórico o importado: no se registró desde este módulo y no se puede anular',
      );
    }
    const activa = retiro.personas.relaciones_laborales[0];
    if (activa) {
      throw new ConflictException(
        activa.fecha_inicio > retiro.fecha_retiro
          ? 'El funcionario se reincorporó después de este retiro: anulá primero la reincorporación'
          : 'El funcionario ya tiene una relación laboral activa: el retiro no se puede anular',
      );
    }
    if (await this.relacionPosterior(retiro, retiro.relaciones_laborales.fecha_inicio)) {
      throw new ConflictException(
        'La relación laboral que cerró este retiro ya no es la más reciente del funcionario: el retiro no se puede anular',
      );
    }

    const cierres = (retiro.cierres_aplicados ?? {}) as {
      destino_id?: string | null;
      inscripciones_ids?: string[];
      comisiones?: { id: string; fecha_fin_anterior: string | null }[];
      usuario_id?: string | null;
    };

    return this.prisma.$transaction(async (tx: any) => {
      // Si después del retiro se le abrió otro destino o pertenencia, reabrir los anteriores
      // violaría los índices únicos: se corta antes con un 409.
      await this.assertSePuedeReabrir(tx, retiro.persona_id, cierres);

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

      await tx.movimientos_laborales.delete({ where: { id: movimientoId } });

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

      // Cada pertenencia vuelve a la fecha_fin que tenía: abierta, o con su fin original.
      for (const c of cierres.comisiones ?? []) {
        await tx.asignaciones_comision.update({
          where: { id: BigInt(c.id) },
          data: { fecha_fin: c.fecha_fin_anterior ? new Date(c.fecha_fin_anterior) : null },
        });
      }

      if (cierres.usuario_id) {
        await tx.usuarios.update({
          where: { id: BigInt(cierres.usuario_id) },
          data: { estado: 'activo' },
        });
      }

      // Vuelve al lugar que tenía antes del retiro; sin rastro de ese lugar, al final de su grado.
      const posicion = await this.posicionPrevia(tx, retiro);
      await this.derecha.asignarEnAltaEnTransaccion(
        tx,
        retiro.persona_id,
        posicion.derecha,
        posicion.numor,
        { motivo: `Anulación de retiro: ${dto.motivo_anulacion}`, usuarioId: autorId },
      );

      return {
        id: retiroId.toString(),
        revertido: {
          relacion_laboral: retiro.relacion_laboral_id.toString(),
          movimiento_borrado: movimientoId.toString(),
          destino: cierres.destino_id ?? null,
          inscripciones: cierres.inscripciones_ids ?? [],
          comisiones: (cierres.comisiones ?? []).map((c) => c.id),
          usuario: cierres.usuario_id ?? null,
        },
      };
    });
  }

  /**
   * Verifica que después del retiro no se le haya abierto otro destino, ni otra pertenencia
   * en la misma comisión. Si pasó, responde 409 indicando qué hay que cerrar.
   */
  private async assertSePuedeReabrir(
    tx: any,
    personaId: bigint,
    cierres: {
      destino_id?: string | null;
      comisiones?: { id: string; fecha_fin_anterior: string | null }[];
    },
  ): Promise<void> {
    if (cierres.destino_id) {
      const otro = await tx.destinos.findFirst({
        where: { persona_id: personaId, fecha_fin: null, id: { not: BigInt(cierres.destino_id) } },
        select: {
          id: true,
          fecha_inicio: true,
          unidades: { select: { denominacion: true } },
          sub_unidades: { select: { denominacion: true } },
        },
      });
      if (otro) {
        throw new ConflictException(
          `No se puede anular el retiro: después del retiro se le asignó otro destino ` +
            `(${otro.sub_unidades?.denominacion ?? otro.unidades?.denominacion ?? `destino ${otro.id}`}, desde ${soloFechaIso(otro.fecha_inicio)}). ` +
            'Cerrá o quitá ese destino y volvé a anular.',
        );
      }
    }

    // Solo chocan las que vuelven a quedar abiertas (fecha_fin_anterior null).
    const aReabrir = (cierres.comisiones ?? []).filter((c) => c.fecha_fin_anterior == null);
    if (aReabrir.length) {
      const propias = await tx.asignaciones_comision.findMany({
        where: { id: { in: aReabrir.map((c) => BigInt(c.id)) } },
        select: { id: true, comision_id: true },
      });
      const otra = await tx.asignaciones_comision.findFirst({
        where: {
          persona_id: personaId,
          fecha_fin: null,
          comision_id: { in: propias.map((p: { comision_id: bigint }) => p.comision_id) },
          id: { notIn: propias.map((p: { id: bigint }) => p.id) },
        },
        select: { id: true, comisiones: { select: { denominacion: true } } },
      });
      if (otra) {
        throw new ConflictException(
          `No se puede anular el retiro: después del retiro se le abrió otra pertenencia en la comisión ` +
            `"${otra.comisiones?.denominacion ?? otra.id}". Cerrala o quitala y volvé a anular.`,
        );
      }
    }
  }

  /**
   * El lugar en la derecha y el numor que tenía el funcionario antes del retiro, como posiciones
   * dentro de su grado y su grupo, que es lo que recibe asignarEnAltaEnTransaccion. El retiro no lo
   * guarda: sale del historial de la BAJA que escribió el cierre, en la misma transacción que el
   * retiro (por eso la ventana alrededor de registrado_en). La BAJA de una reincorporación anulada
   * no cuenta: esa posición era la del final del grado.
   */
  private async posicionPrevia(
    tx: any,
    retiro: { persona_id: bigint; relacion_laboral_id: bigint; registrado_en: Date | null },
  ): Promise<{ derecha: number | null; numor: number | null }> {
    const sinPosicion = { derecha: null, numor: null };
    if (!retiro.registrado_en) return sinPosicion;
    const margen = 14 * 3_600_000; // historial_derecha_numor.fecha no tiene zona horaria
    const baja = await tx.historial_derecha_numor.findFirst({
      where: {
        persona_id: retiro.persona_id,
        tipo: 'DERECHA',
        operacion: 'BAJA',
        // Una BAJA también registra a los que se corrieron un lugar: esos quedan con valor nuevo.
        valor_anterior: { not: null },
        valor_nuevo: null,
        NOT: { motivo: { startsWith: MOTIVO_ANULACION_REINCORPORACION } },
        fecha: {
          gte: new Date(retiro.registrado_en.getTime() - margen),
          lte: new Date(retiro.registrado_en.getTime() + margen),
        },
      },
      orderBy: { fecha: 'desc' },
      select: { valor_anterior: true, lote_id: true },
    });
    if (!baja) return sinPosicion;

    const [corridos, relacion] = await Promise.all([
      // Los que la baja corrió un lugar estaban detrás del funcionario.
      tx.historial_derecha_numor.findMany({
        where: {
          lote_id: baja.lote_id,
          persona_id: { not: retiro.persona_id },
          valor_nuevo: { not: null },
        },
        select: { persona_id: true, tipo: true },
      }),
      tx.relaciones_laborales.findUnique({
        where: { id: retiro.relacion_laboral_id },
        select: { grado_id: true, escalafon_id: true },
      }),
    ]);
    if (!relacion?.grado_id) return sinPosicion;

    const detras = (tipo: 'DERECHA' | 'NUMOR') =>
      corridos.filter((c: any) => c.tipo === tipo).map((c: any) => c.persona_id);
    const vigentes = {
      persona_id: { not: retiro.persona_id },
      estado: 'activo',
      fecha_fin: null,
      grado_id: relacion.grado_id,
    };

    // Vuelve justo delante del primero de los que tenía detrás y siguen en su grado (o grupo).
    // Comparar contra el valor viejo fallaría si después alguien entró o salió adelante.
    const posicionEn = async (campo: 'derecha' | 'numor', filtro: object, personas: bigint[]) => {
      if (personas.length === 0) return null;
      const primero = await tx.relaciones_laborales.findFirst({
        where: { ...vigentes, ...filtro, persona_id: { in: personas }, [campo]: { not: null } },
        orderBy: { [campo]: 'asc' },
        select: { [campo]: true },
      });
      if (!primero) return null;
      const adelante = await tx.relaciones_laborales.count({
        where: { ...vigentes, ...filtro, [campo]: { not: null, lt: primero[campo] } },
      });
      return adelante + 1;
    };

    return {
      derecha: await posicionEn('derecha', {}, detras('DERECHA')),
      numor: relacion.escalafon_id
        ? await posicionEn('numor', { escalafon_id: relacion.escalafon_id }, detras('NUMOR'))
        : null,
    };
  }

  /**
   * Deshace una reincorporación cargada por error: borra la relación que abrió (con su situación
   * SIT16/SIT17 y su movimiento), borra el destino que asignó, reabre el que cerró y la saca de la
   * derecha. Después el retiro vuelve a ser el más reciente y se puede anular.
   */
  async anularReincorporacion(retiroId: number, dto: AnularRetiroDto, autorId: bigint) {
    const retiro = await this.prisma.retiros.findUnique({ where: { id: BigInt(retiroId) } });
    if (!retiro) throw new NotFoundException('Retiro no encontrado');
    if (retiro.anulado) throw new ConflictException('El retiro está anulado');

    const posteriores = await this.prisma.relaciones_laborales.findMany({
      where: { persona_id: retiro.persona_id, fecha_inicio: { gt: retiro.fecha_retiro } },
      orderBy: [{ fecha_inicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        estado: true,
        fecha_inicio: true,
        unidad_id: true,
        situaciones: { select: { codigo: true } },
      },
    });
    if (posteriores.length === 0) {
      throw new ConflictException('El funcionario no se reincorporó después de este retiro');
    }
    if (posteriores.length > 1) {
      throw new ConflictException(
        'Después de la reincorporación hubo un ascenso u otro cambio de relación laboral: anulalo primero',
      );
    }
    const relacion = posteriores[0];
    if (!CODIGOS_REINCORPORADO.includes(relacion.situaciones?.codigo)) {
      throw new UnprocessableEntityException(
        'La relación posterior al retiro no es de reincorporado (SIT16 o SIT17)',
      );
    }
    if (relacion.estado !== 'activo') {
      throw new ConflictException(
        'La relación de la reincorporación ya está cerrada por un retiro posterior: anulá ese retiro primero',
      );
    }

    const [movimientos, ascensos, retirosPosteriores, liquidaciones, compensaciones, destinos] =
      await Promise.all([
        this.prisma.movimientos_laborales.findMany({
          where: { relacion_laboral_id: relacion.id },
          select: { id: true, tipos_movimiento: { select: { nombre: true, es_alta: true } } },
        }),
        this.prisma.ascensos.count({
          where: {
            OR: [{ relacion_laboral_anterior_id: relacion.id }, { relacion_laboral_nueva_id: relacion.id }],
          },
        }),
        this.prisma.retiros.count({ where: { relacion_laboral_id: relacion.id } }),
        this.prisma.items_liquidacion.count({ where: { relacion_laboral_id: relacion.id } }),
        this.prisma.compensaciones_diferencia_ascenso.count({
          where: { relacion_laboral_nueva_id: relacion.id },
        }),
        this.prisma.destinos.findMany({
          where: { persona_id: retiro.persona_id, fecha_inicio: { gte: relacion.fecha_inicio } },
          orderBy: { id: 'desc' },
          select: { id: true, unidad_id: true, fecha_inicio: true },
        }),
      ]);

    if (ascensos > 0) {
      throw new ConflictException('La reincorporación tiene un ascenso registrado: anulalo primero');
    }
    if (retirosPosteriores > 0) {
      throw new ConflictException(
        'La relación de la reincorporación tiene un retiro registrado: anulá ese retiro primero',
      );
    }
    if (liquidaciones > 0 || compensaciones > 0) {
      throw new ConflictException(
        'La relación de la reincorporación ya se usó en liquidaciones: no se puede anular',
      );
    }
    const ajenos = movimientos.filter(
      (m) => !(m.tipos_movimiento?.nombre === 'Reincorporacion' && m.tipos_movimiento?.es_alta),
    );
    if (ajenos.length > 0) {
      throw new ConflictException(
        'La relación de la reincorporación tiene otros movimientos laborales: anulalos primero',
      );
    }

    const fechaInicio = relacion.fecha_inicio.getTime();
    const destinoNuevo = destinos.find(
      (d) => d.unidad_id === relacion.unidad_id && d.fecha_inicio?.getTime() === fechaInicio,
    );
    if (destinos.some((d) => d.id !== destinoNuevo?.id)) {
      throw new ConflictException(
        'El funcionario cambió de destino después de la reincorporación: corregí los destinos primero',
      );
    }

    return this.prisma.$transaction(async (tx: any) => {
      // Mientras la relación existe: la baja la saca del padrón y deja el historial.
      await this.derecha.quitarPorInactividadEnTransaccion(tx, retiro.persona_id, {
        motivo: `${MOTIVO_ANULACION_REINCORPORACION}: ${dto.motivo_anulacion}`,
        usuarioId: autorId,
      });

      await tx.movimientos_laborales.deleteMany({ where: { relacion_laboral_id: relacion.id } });

      let destinoReabierto: string | null = null;
      if (destinoNuevo) {
        await tx.destinos.delete({ where: { id: destinoNuevo.id } });
        // El que la reincorporación cerró el día anterior estaba abierto.
        const cerrado = await tx.destinos.findFirst({
          where: { persona_id: retiro.persona_id, fecha_fin: diaAnterior(relacion.fecha_inicio) },
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        if (cerrado) {
          await tx.destinos.update({ where: { id: cerrado.id }, data: { fecha_fin: null } });
          destinoReabierto = cerrado.id.toString();
        }
      }

      await tx.relaciones_laborales.delete({ where: { id: relacion.id } });

      return {
        retiro_id: retiro.id.toString(),
        revertido: {
          relacion_laboral_borrada: relacion.id.toString(),
          movimientos_borrados: movimientos.map((m) => m.id.toString()),
          destino_borrado: destinoNuevo?.id.toString() ?? null,
          destino_reabierto: destinoReabierto,
        },
      };
    });
  }

  private async evaluarReincorporacion(retiroId: number) {
    const retiro = await this.prisma.retiros.findUnique({
      where: { id: BigInt(retiroId) },
      include: {
        personas: {
          select: {
            id: true,
            cedula: true,
            primer_nombre: true,
            primer_apellido: true,
            fecha_fallecimiento: true,
            relaciones_laborales: { where: { estado: 'activo' }, select: { id: true }, take: 1 },
          },
        },
        motivos_baja: { select: { codigo: true } },
        relaciones_laborales: {
          include: {
            grados: { select: { id: true, codigo: true, denominacion: true, es_oficial: true, es_subalterno: true } },
            unidades: { select: { id: true, denominacion: true } },
            escalafones: { select: { id: true, denominacion: true } },
            regimenes: { select: { id: true, denominacion: true } },
            programas: { select: { id: true, denominacion: true } },
          },
        },
      },
    });
    if (!retiro) throw new NotFoundException('Retiro no encontrado');

    const cerrada = retiro.relaciones_laborales;
    const grado = cerrada.grados;
    const tipo =
      cerrada.tipo_funcionario ??
      (grado?.es_oficial ? 'oficial' : grado ? 'subalterno' : null);
    const categoria: Categoria | null = tipo === 'oficial' || tipo === 'subalterno' ? tipo : null;
    const codigoSituacion = categoria ? SITUACION_REINCORPORADO[categoria] : null;

    const [posterior, situacion, tipoMovimiento, destinoAbierto] = await Promise.all([
      this.relacionPosterior(retiro, cerrada.fecha_inicio),
      codigoSituacion
        ? this.prisma.situaciones.findFirst({ where: { codigo: codigoSituacion } })
        : Promise.resolve(null),
      this.prisma.tipos_movimiento.findFirst({ where: { nombre: 'Reincorporacion', es_alta: true } }),
      this.prisma.destinos.findFirst({
        where: { persona_id: retiro.persona_id, fecha_fin: null },
        select: {
          id: true,
          unidad_id: true,
          fecha_inicio: true,
          unidades: { select: { id: true, denominacion: true } },
        },
      }),
    ]);

    const conflictos: string[] = [];
    if (retiro.anulado) conflictos.push('El retiro está anulado.');
    if (retiro.personas.relaciones_laborales.length > 0) {
      conflictos.push('El funcionario ya tiene una relación laboral activa.');
    } else if (posterior) {
      conflictos.push('Solo se puede reincorporar desde el retiro más reciente del funcionario.');
    }

    const invalidos: string[] = [];
    if (retiro.personas.fecha_fallecimiento || retiro.motivos_baja?.codigo === 'FALLECIMIENTO') {
      invalidos.push('El funcionario falleció: no se puede reincorporar.');
    }
    if (!categoria) {
      invalidos.push('La reincorporación es solo para personal superior o subalterno.');
    } else if (grado && gradoNoReincorporable(grado.codigo)) {
      invalidos.push(`Los funcionarios con grado ${grado.denominacion} no se reincorporan.`);
    } else if (grado && !gradoCorresponde(grado, categoria)) {
      invalidos.push(
        `El grado ${grado?.denominacion} no corresponde a personal ${categoria === 'oficial' ? 'superior' : 'subalterno'}.`,
      );
    }
    if (codigoSituacion && !situacion) {
      invalidos.push(`La situación ${codigoSituacion} no existe en el catálogo.`);
    }
    if (!tipoMovimiento) {
      invalidos.push("El tipo de movimiento 'Reincorporacion' no existe en el catálogo.");
    }

    return { retiro, cerrada, categoria, situacion, tipoMovimiento, destinoAbierto, conflictos, invalidos };
  }

  async previaReincorporacion(retiroId: number) {
    const e = await this.evaluarReincorporacion(retiroId);
    const c = e.cerrada;
    const categoria = e.categoria;
    const grados = categoria
      ? await this.prisma.grados.findMany({
          where: { vigente: true },
          orderBy: { orden: 'asc' },
          select: { id: true, codigo: true, denominacion: true, es_oficial: true },
        })
      : [];

    return {
      retiro: { id: e.retiro.id.toString(), fecha_retiro: soloFecha(e.retiro.fecha_retiro) },
      persona: {
        id: e.retiro.personas.id.toString(),
        cedula: e.retiro.personas.cedula,
        primer_nombre: e.retiro.personas.primer_nombre,
        primer_apellido: e.retiro.personas.primer_apellido,
      },
      situacion: e.situacion
        ? {
            id: e.situacion.id.toString(),
            codigo: e.situacion.codigo,
            denominacion: e.situacion.denominacion,
          }
        : null,
      se_copia: {
        regimen: ref(c.regimenes),
        programa: ref(c.programas),
        escalafon: ref(c.escalafones),
        grado: ref(c.grados),
        tipo_funcionario: e.categoria,
        fecha_ascenso_oficial: soloFecha(c.fecha_ascenso_oficial),
        fecha_ultimo_ascenso: soloFecha(c.fecha_ultimo_ascenso),
        anios_servicio_anterior: c.anios_servicio_anterior,
        anios_inactivos: c.anios_inactivos,
        riesgo_vuelo: c.riesgo_vuelo == null ? null : Number(c.riesgo_vuelo),
        categoria_viatico: c.categoria_viatico,
        usa_fonasa: c.usa_fonasa,
        superprima: c.superprima,
        prima_tecnica: c.prima_tecnica,
        prima_solidaria_familiar: c.prima_solidaria_familiar,
      },
      unidad_anterior: ref(c.unidades),
      grados_validos: categoria
        ? grados
            .filter((g) => gradoAdmitido(g, categoria))
            .map((g) => ({ id: g.id.toString(), codigo: g.codigo, denominacion: g.denominacion }))
        : [],
      destino_abierto: e.destinoAbierto
        ? {
            id: e.destinoAbierto.id.toString(),
            unidad: ref(e.destinoAbierto.unidades),
            fecha_inicio: soloFecha(e.destinoAbierto.fecha_inicio),
          }
        : null,
      bloqueos: [...e.conflictos, ...e.invalidos],
    };
  }

  async reincorporar(retiroId: number, dto: ReincorporarDto, autorId: bigint) {
    const e = await this.evaluarReincorporacion(retiroId);
    if (e.conflictos.length > 0) throw new ConflictException(e.conflictos.join(' '));
    if (e.invalidos.length > 0) throw new UnprocessableEntityException(e.invalidos.join(' '));
    const { retiro, cerrada, destinoAbierto } = e;
    const categoria = e.categoria!;
    const situacion = e.situacion!;
    const tipoMovimiento = e.tipoMovimiento!;

    const fecha = new Date(dto.fecha_reincorporacion);
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    if (fecha <= retiro.fecha_retiro) {
      throw new UnprocessableEntityException(
        'La fecha de reincorporación tiene que ser posterior a la del retiro',
      );
    }
    if (fecha > hoy) {
      throw new UnprocessableEntityException('La fecha de reincorporación no puede ser futura');
    }

    validarParCalculo(dto);

    const unidadId = BigInt(dto.unidad_id);
    const [gradoReincorporacion, unidad] = await Promise.all([
      this.validarGradoReincorporacion(dto.grado_reincorporacion_id, categoria),
      this.prisma.unidades.findUnique({ where: { id: unidadId }, select: { id: true, vigente: true } }),
    ]);
    if (!unidad || !unidad.vigente) {
      throw new UnprocessableEntityException('Unidad no encontrada o no vigente');
    }

    const cierreDestino = diaAnterior(fecha);
    if (destinoAbierto?.fecha_inicio && cierreDestino < destinoAbierto.fecha_inicio) {
      throw new UnprocessableEntityException(
        'El destino abierto empieza después de la fecha de reincorporación: corregilo desde destinos',
      );
    }

    return this.prisma.$transaction(async (tx: any) => {
      const relacion = await tx.relaciones_laborales.create({
        data: {
          persona_id: retiro.persona_id,
          regimen_id: cerrada.regimen_id,
          unidad_id: unidadId,
          sub_unidad_id: unidadId === cerrada.unidad_id ? cerrada.sub_unidad_id : null,
          programa_id: cerrada.programa_id,
          situacion_id: situacion.id,
          escalafon_id: cerrada.escalafon_id,
          // El retiro no cambia el grado; el de reincorporación solo fija la base del sueldo.
          grado_id: cerrada.grado_id,
          grado_reincorporacion_id: gradoReincorporacion.id,
          haber_retiro: dto.haber_retiro ?? null,
          porcentaje_progresivo: dto.porcentaje_progresivo ?? null,
          fecha_inicio: fecha,
          estado: 'activo',
          tipo_funcionario: categoria,
          fecha_ascenso_oficial: cerrada.fecha_ascenso_oficial,
          fecha_ultimo_ascenso: cerrada.fecha_ultimo_ascenso,
          anios_servicio_anterior: cerrada.anios_servicio_anterior,
          anios_inactivos: cerrada.anios_inactivos,
          riesgo_vuelo: cerrada.riesgo_vuelo,
          categoria_viatico: cerrada.categoria_viatico,
          usa_fonasa: cerrada.usa_fonasa,
          superprima: cerrada.superprima,
          prima_tecnica: cerrada.prima_tecnica,
          prima_solidaria_familiar: cerrada.prima_solidaria_familiar,
          tiene_mando: cerrada.tiene_mando,
          mutaciones: cerrada.mutaciones,
          conducta: cerrada.conducta,
          observaciones: dto.observaciones ?? cerrada.observaciones,
        },
      });

      const movimiento = await tx.movimientos_laborales.create({
        data: {
          relacion_laboral_id: relacion.id,
          tipo_movimiento_id: tipoMovimiento.id,
          fecha_movimiento: fecha,
          usuario_id: autorId,
          observaciones: dto.observaciones ?? null,
        },
      });

      // Aunque conservara la plaza en la misma unidad, el destino nuevo es el que registra la orden del acto.
      if (destinoAbierto) {
        await tx.destinos.update({
          where: { id: destinoAbierto.id },
          data: { fecha_fin: cierreDestino },
        });
      }
      const destino = await tx.destinos.create({
        data: {
          persona_id: retiro.persona_id,
          unidad_id: unidadId,
          // Misma sub-unidad que la relación nueva: se conserva si vuelve al mismo comando.
          sub_unidad_id: relacion.sub_unidad_id,
          fecha_inicio: fecha,
          posicion_destino: dto.posicion_destino ?? null,
          numero_orden: dto.numero_orden ?? null,
          boletin: dto.boletin ?? null,
          observaciones: dto.observaciones ?? null,
        },
      });

      await this.derecha.asignarEnAltaEnTransaccion(tx, retiro.persona_id, null, null, {
        motivo: 'Reincorporación',
        usuarioId: autorId,
      });

      return {
        retiro_id: retiro.id.toString(),
        relacion_laboral: {
          id: relacion.id.toString(),
          fecha_inicio: soloFecha(fecha),
          situacion: { codigo: situacion.codigo, denominacion: situacion.denominacion },
        },
        movimiento_id: movimiento.id.toString(),
        destino: {
          id: destino.id.toString(),
          anterior_cerrado: destinoAbierto?.id.toString() ?? null,
        },
      };
    });
  }

  private async validarGradoReincorporacion(gradoId: number, categoria: Categoria) {
    const grado = await this.prisma.grados.findUnique({
      where: { id: BigInt(gradoId) },
      select: { id: true, codigo: true, denominacion: true, vigente: true, es_oficial: true, es_subalterno: true },
    });
    if (!grado || !grado.vigente) {
      throw new UnprocessableEntityException('Grado de reincorporación no encontrado o no vigente');
    }
    if (gradoNoReincorporable(grado.codigo)) {
      throw new UnprocessableEntityException(
        `El grado ${grado.denominacion} no se puede usar como grado de reincorporación`,
      );
    }
    if (!gradoCorresponde(grado, categoria)) {
      throw new UnprocessableEntityException(
        `El grado de reincorporación no corresponde a personal ${categoria === 'oficial' ? 'superior' : 'subalterno'}`,
      );
    }
    return grado;
  }

  async actualizarReincorporacion(retiroId: number, dto: ActualizarReincorporacionDto) {
    const retiro = await this.prisma.retiros.findUnique({ where: { id: BigInt(retiroId) } });
    if (!retiro) throw new NotFoundException('Retiro no encontrado');
    if (retiro.anulado) throw new ConflictException('El retiro está anulado');

    validarParCalculo(dto);
    if (dto.grado_reincorporacion_id == null && dto.haber_retiro == null) {
      throw new UnprocessableEntityException('No hay datos para actualizar');
    }

    const relaciones = await this.relacionesDeLaReincorporacion(retiro);
    if (!relaciones) {
      throw new ConflictException('El funcionario no se reincorporó después de este retiro');
    }
    const relacion = relaciones.actual;
    // Una relación cerrada ya se liquidó con lo que tenía: cambiarla reescribe la historia.
    if (relacion.estado !== 'activo') {
      throw new ConflictException(
        'La relación de la reincorporación ya está cerrada: sus datos de cálculo no se cambian',
      );
    }
    const codigo = relacion.situaciones?.codigo;
    if (codigo !== SITUACION_REINCORPORADO.oficial && codigo !== SITUACION_REINCORPORADO.subalterno) {
      throw new UnprocessableEntityException(
        'La relación posterior al retiro no es de reincorporado (SIT16 o SIT17)',
      );
    }

    if (dto.grado_reincorporacion_id != null) {
      await this.validarGradoReincorporacion(
        dto.grado_reincorporacion_id,
        codigo === SITUACION_REINCORPORADO.oficial ? 'oficial' : 'subalterno',
      );
    }

    await this.prisma.relaciones_laborales.update({
      where: { id: relacion.id },
      data: {
        ...(dto.grado_reincorporacion_id != null && {
          grado_reincorporacion_id: BigInt(dto.grado_reincorporacion_id),
        }),
        ...(dto.haber_retiro != null && {
          haber_retiro: dto.haber_retiro,
          porcentaje_progresivo: dto.porcentaje_progresivo,
        }),
        fecha_actualizacion: new Date(),
      },
    });

    return this.obtener(retiroId);
  }
}

/** `YYYY-MM-DD` de una columna `@db.Date` (llega como medianoche UTC). */
function soloFechaIso(fecha: Date | null | undefined): string {
  return fecha ? fecha.toISOString().slice(0, 10) : 'fecha desconocida';
}

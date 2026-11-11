import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { CreateDestinoDto } from './dto/create-destino.dto';
import { UpdateDestinoDto } from './dto/update-destino.dto';
import { ListDestinosQueryDto } from './dto/list-destinos-query.dto';
import { ListSubUnidadesQueryDto } from './dto/list-sub-unidades-query.dto';
import { ListFuncionariosUnidadQueryDto } from './dto/list-funcionarios-unidad-query.dto';
import { CategoriaPersonal, wherePersonaPorCategoria } from '../../lib/personal/categoria-personal';

// Un destino está vigente mientras no tenga fecha de fin.
const esActivo = (fechaFin: Date | null) => fechaFin == null;

const soloFecha = (fecha: Date | null) =>
  fecha ? fecha.toISOString().split('T')[0] : null;

const diaAnterior = (fecha: Date) => {
  const previo = new Date(fecha);
  previo.setUTCDate(previo.getUTCDate() - 1);
  return previo;
};

@Injectable()
export class DestinosService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly includeDestino = {
    personas: {
      select: { id: true, cedula: true, primer_nombre: true, primer_apellido: true },
    },
    unidades: { select: { id: true, codigo: true, denominacion: true } },
    sub_unidades: { select: { id: true, codigo: true, denominacion: true } },
  };

  /** Filtro de personas compartido por los listados (cédula, nombre o apellido). */
  private filtroPersona(texto?: string, categoria?: CategoriaPersonal) {
    return {
      ...(texto && {
        OR: [
          { cedula: { contains: texto, mode: 'insensitive' as const } },
          { primer_nombre: { contains: texto, mode: 'insensitive' as const } },
          { primer_apellido: { contains: texto, mode: 'insensitive' as const } },
        ],
      }),
      ...(categoria && { AND: [wherePersonaPorCategoria(categoria)] }),
    };
  }

  private mapDestino(a: any) {
    return {
      id: a.id.toString(),
      persona: a.personas
        ? {
            id: a.personas.id.toString(),
            cedula: a.personas.cedula,
            primer_nombre: a.personas.primer_nombre,
            primer_apellido: a.personas.primer_apellido,
          }
        : null,
      // Comando (C.A.O., C.A.P., ...). El lugar donde revista es `sub_unidad`.
      unidad: a.unidades
        ? {
            id: a.unidades.id.toString(),
            codigo: a.unidades.codigo,
            denominacion: a.unidades.denominacion,
          }
        : null,
      // Null solo en destinos históricos cargados antes de que el destino guardara la sub-unidad.
      sub_unidad: a.sub_unidades
        ? {
            id: a.sub_unidades.id.toString(),
            codigo: a.sub_unidades.codigo,
            denominacion: a.sub_unidades.denominacion,
          }
        : null,
      fecha_inicio: soloFecha(a.fecha_inicio),
      fecha_fin: soloFecha(a.fecha_fin),
      posicion_destino: a.posicion_destino,
      numero_orden: a.numero_orden,
      boletin: a.boletin,
      numero_destino: a.numero_destino,
      fecha_orden: soloFecha(a.fecha_orden),
      fecha_boletin: soloFecha(a.fecha_boletin),
      numero_resolucion: a.numero_resolucion,
      fecha_resolucion: soloFecha(a.fecha_resolucion),
      observaciones: a.observaciones,
      activo: esActivo(a.fecha_fin),
    };
  }

  /**
   * Registra un destino en una sub-unidad (B.A.I., E.M.A., ...). Su comando queda en
   * `unidad_id`. Si el funcionario ya revistaba en otra sub-unidad, el pase cierra esa
   * asignación y abre la nueva en la misma transacción, y deja la relación laboral activa
   * apuntando a la sub-unidad y al comando nuevos, como hace liquidación.
   */
  async crearDestino(dto: CreateDestinoDto) {
    if (!dto.numero_orden && !dto.boletin) {
      throw new BadRequestException('Se requiere al menos número de orden o boletín');
    }

    const personaId = BigInt(dto.persona_id);
    const subUnidadId = BigInt(dto.sub_unidad_id);

    const [persona, subUnidad] = await Promise.all([
      this.prisma.personas.findUnique({ where: { id: personaId } }),
      this.prisma.sub_unidades.findUnique({ where: { id: subUnidadId } }),
    ]);
    if (!persona) throw new NotFoundException(`No existe personal con id ${dto.persona_id}`);
    if (!subUnidad) throw new NotFoundException(`No existe sub-unidad con id ${dto.sub_unidad_id}`);
    const unidadId = subUnidad.unidad_id;

    const fechaInicio = new Date(dto.fecha_inicio);

    const activo = await this.prisma.destinos.findFirst({
      where: { persona_id: personaId, fecha_fin: null },
    });

    if (activo && activo.sub_unidad_id === subUnidadId) {
      throw new ConflictException(
        `El funcionario ${dto.persona_id} ya tiene un destino activo en esa sub-unidad`,
      );
    }

    let fechaCierre: Date | null = null;
    if (activo) {
      fechaCierre = dto.fecha_fin_anterior
        ? new Date(dto.fecha_fin_anterior)
        : diaAnterior(fechaInicio);

      if (activo.fecha_inicio && fechaCierre < activo.fecha_inicio) {
        throw new BadRequestException(
          'La fecha de cierre del destino anterior es previa a su fecha de inicio',
        );
      }
    }

    const creado = await this.prisma.$transaction(async (tx) => {
      if (activo) {
        await tx.destinos.update({
          where: { id: activo.id },
          data: { fecha_fin: fechaCierre },
        });
      }

      const nuevo = await tx.destinos.create({
        data: {
          persona_id: personaId,
          unidad_id: unidadId,
          sub_unidad_id: subUnidadId,
          fecha_inicio: fechaInicio,
          fecha_fin: null,
          posicion_destino: dto.posicion_destino ?? null,
          numero_orden: dto.numero_orden ?? null,
          boletin: dto.boletin ?? null,
          numero_destino: dto.numero_destino ?? null,
          fecha_orden: dto.fecha_orden ? new Date(dto.fecha_orden) : null,
          fecha_boletin: dto.fecha_boletin ? new Date(dto.fecha_boletin) : null,
          numero_resolucion: dto.numero_resolucion ?? null,
          fecha_resolucion: dto.fecha_resolucion ? new Date(dto.fecha_resolucion) : null,
          observaciones: dto.observaciones ?? null,
        },
        include: this.includeDestino,
      });

      // El destino es la fuente de verdad de dónde revista el funcionario.
      // La relación vigente se identifica por `fecha_fin: null`, igual que en
      // GET /personas y en el perfil: filtrar por `estado: 'activo'` dejaba sin
      // sincronizar a quien tiene la relación abierta con otro estado (por
      // ejemplo con situación Retiro), y el listado quedaba con la unidad vieja.
      await tx.relaciones_laborales.updateMany({
        where: { persona_id: personaId, fecha_fin: null },
        data: { unidad_id: unidadId, sub_unidad_id: subUnidadId },
      });

      return nuevo;
    });

    return this.mapDestino(creado);
  }

  // ─── Listados ───────────────────────────────────────────────────────────────

  async listarDestinos(query: ListDestinosQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);

    const where: any = {};
    if (query.unidad_id) where.unidad_id = BigInt(query.unidad_id);
    if (query.sub_unidad_id) where.sub_unidad_id = BigInt(query.sub_unidad_id);
    if (query.activo === true) where.fecha_fin = null;
    else if (query.activo === false) where.fecha_fin = { not: null };
    if (query.query || query.categoria) {
      where.personas = this.filtroPersona(query.query, query.categoria);
    }

    const [total, destinosActivos, asignaciones, subUnidadesActivas] =
      await this.prisma.$transaction([
        this.prisma.destinos.count({ where }),
        this.prisma.destinos.count({ where: { fecha_fin: null } }),
        this.prisma.destinos.findMany({
          where,
          orderBy: [{ fecha_inicio: 'desc' }, { personas: { primer_apellido: 'asc' } }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: this.includeDestino,
        }),
        this.prisma.destinos.findMany({
          where: { fecha_fin: null, sub_unidad_id: { not: null } },
          select: { sub_unidad_id: true },
          distinct: ['sub_unidad_id'],
        }),
      ]);

    return {
      items: asignaciones.map((a) => this.mapDestino(a)),
      total,
      page,
      pageSize,
      stats: {
        total_destinos: total,
        destinos_activos: destinosActivos,
        sub_unidades_con_personal: subUnidadesActivas.length,
      },
    };
  }

  async obtenerDestino(destinoId: number) {
    const asignacion = await this.prisma.destinos.findUnique({
      where: { id: BigInt(destinoId) },
      include: this.includeDestino,
    });
    if (!asignacion) throw new NotFoundException(`No existe destino con id ${destinoId}`);

    return this.mapDestino(asignacion);
  }

  /**
   * Sub-unidades (los destinos posibles) con su comando y cuántos funcionarios revistan hoy.
   * El catálogo es de liquidación: acá solo se lee.
   */
  async listarSubUnidades(query: ListSubUnidadesQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);

    const where: any = {};
    if (query.query) {
      where.OR = [
        { denominacion: { contains: query.query, mode: 'insensitive' } },
        { codigo: { contains: query.query, mode: 'insensitive' } },
      ];
    }
    if (query.unidad_id) where.unidad_id = BigInt(query.unidad_id);
    if (query.vigente !== undefined) where.vigente = query.vigente;

    const [total, subUnidades] = await this.prisma.$transaction([
      this.prisma.sub_unidades.count({ where }),
      this.prisma.sub_unidades.findMany({
        where,
        // Agrupadas por comando, en el orden del catálogo de liquidación.
        orderBy: [{ unidad_id: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          unidades: { select: { id: true, codigo: true, denominacion: true } },
          _count: { select: { destinos: { where: { fecha_fin: null } } } },
        },
      }),
    ]);

    return {
      items: subUnidades.map((su: any) => ({
        id: su.id.toString(),
        codigo: su.codigo,
        denominacion: su.denominacion,
        vigente: su.vigente,
        unidad: {
          id: su.unidades.id.toString(),
          codigo: su.unidades.codigo,
          denominacion: su.unidades.denominacion,
        },
        total_destinados: su._count.destinos,
      })),
      total,
      page,
      pageSize,
    };
  }

  async listarFuncionariosSubUnidad(
    subUnidadId: number,
    query: ListFuncionariosUnidadQueryDto = {},
  ) {
    const subUnidad = await this.prisma.sub_unidades.findUnique({
      where: { id: BigInt(subUnidadId) },
    });
    if (!subUnidad) throw new NotFoundException(`No existe sub-unidad con id ${subUnidadId}`);

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);

    const where: any = { sub_unidad_id: BigInt(subUnidadId) };
    if (query.activo === true) where.fecha_fin = null;
    else if (query.activo === false) where.fecha_fin = { not: null };
    if (query.query || query.categoria) {
      where.personas = this.filtroPersona(query.query, query.categoria);
    }

    const [total, asignaciones] = await this.prisma.$transaction([
      this.prisma.destinos.count({ where }),
      this.prisma.destinos.findMany({
        where,
        orderBy: [{ fecha_inicio: 'desc' }, { personas: { primer_apellido: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...this.includeDestino,
          personas: {
            select: {
              id: true,
              cedula: true,
              primer_nombre: true,
              primer_apellido: true,
              relaciones_laborales: {
                orderBy: { fecha_inicio: 'desc' },
                take: 1,
                select: { estado: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      items: asignaciones.map((a) => ({
        ...this.mapDestino(a),
        // Un retirado cuyo destino quedó abierto sigue apareciendo acá
        relacion_estado: a.personas?.relaciones_laborales?.[0]?.estado ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  // ─── Edición y baja ─────────────────────────────────────────────────────────

  async editarDestino(destinoId: number, dto: UpdateDestinoDto) {
    const asignacion = await this.prisma.destinos.findUnique({
      where: { id: BigInt(destinoId) },
    });
    if (!asignacion) throw new NotFoundException(`No existe destino con id ${destinoId}`);

    const ordenFinal = dto.numero_orden !== undefined ? dto.numero_orden : asignacion.numero_orden;
    const boletinFinal = dto.boletin !== undefined ? dto.boletin : asignacion.boletin;
    // Solo se valida si la edición cambia los documentos: hay destinos históricos sin
    // número de orden ni boletín.
    const tocaDocumentos = dto.numero_orden !== undefined || dto.boletin !== undefined;
    if (tocaDocumentos && !ordenFinal && !boletinFinal) {
      throw new BadRequestException(
        'El destino debe conservar al menos número de orden o boletín',
      );
    }

    const fechaInicio = dto.fecha_inicio ? new Date(dto.fecha_inicio) : asignacion.fecha_inicio;
    const fechaFin =
      dto.fecha_fin !== undefined
        ? dto.fecha_fin
          ? new Date(dto.fecha_fin)
          : null
        : asignacion.fecha_fin;

    if (fechaFin && fechaInicio && fechaFin < fechaInicio) {
      throw new BadRequestException(
        'La fecha de fin del destino no puede ser anterior a su fecha de inicio',
      );
    }

    // Reabrir un destino cerrado no puede dejar al funcionario con dos activos.
    if (fechaFin === null && asignacion.fecha_fin !== null) {
      const otroActivo = await this.prisma.destinos.findFirst({
        where: {
          persona_id: asignacion.persona_id,
          fecha_fin: null,
          id: { not: BigInt(destinoId) },
        },
      });
      if (otroActivo) {
        throw new ConflictException(
          'El funcionario ya tiene otro destino activo; cerralo antes de reabrir este',
        );
      }
    }

    // Al reabrirlo pasa a ser el destino vigente: la relación laboral toma su comando y su
    // sub-unidad, como en un pase. Si no tiene base, no se toca.
    const reabre = fechaFin === null && asignacion.fecha_fin !== null;
    if (reabre && asignacion.persona_id && asignacion.unidad_id && asignacion.sub_unidad_id) {
      await this.prisma.relaciones_laborales.updateMany({
        where: { persona_id: asignacion.persona_id, fecha_fin: null },
        data: { unidad_id: asignacion.unidad_id, sub_unidad_id: asignacion.sub_unidad_id },
      });
    }

    const actualizado = await this.prisma.destinos.update({
      where: { id: BigInt(destinoId) },
      data: {
        ...(dto.fecha_inicio !== undefined && { fecha_inicio: fechaInicio }),
        ...(dto.fecha_fin !== undefined && { fecha_fin: fechaFin }),
        ...(dto.posicion_destino !== undefined && { posicion_destino: dto.posicion_destino }),
        ...(dto.numero_orden !== undefined && { numero_orden: dto.numero_orden }),
        ...(dto.boletin !== undefined && { boletin: dto.boletin }),
        ...(dto.numero_destino !== undefined && { numero_destino: dto.numero_destino }),
        ...(dto.fecha_orden !== undefined && {
          fecha_orden: dto.fecha_orden ? new Date(dto.fecha_orden) : null,
        }),
        ...(dto.fecha_boletin !== undefined && {
          fecha_boletin: dto.fecha_boletin ? new Date(dto.fecha_boletin) : null,
        }),
        ...(dto.numero_resolucion !== undefined && { numero_resolucion: dto.numero_resolucion }),
        ...(dto.fecha_resolucion !== undefined && {
          fecha_resolucion: dto.fecha_resolucion ? new Date(dto.fecha_resolucion) : null,
        }),
        ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
      },
      include: this.includeDestino,
    });

    return this.mapDestino(actualizado);
  }

  /**
   * Elimina un destino cargado por error. Si es el vigente, deshace el pase: la relación
   * laboral vuelve al comando y la sub-unidad del destino anterior, y ese destino se reabre si el pase lo
   * había cerrado (terminaba el día antes o el mismo día).
   */
  async eliminarDestino(destinoId: number) {
    const asignacion = await this.prisma.destinos.findUnique({
      where: { id: BigInt(destinoId) },
    });
    if (!asignacion) throw new NotFoundException(`No existe destino con id ${destinoId}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.destinos.delete({ where: { id: asignacion.id } });

      // Un destino cerrado no define la unidad actual.
      if (asignacion.fecha_fin !== null || !asignacion.persona_id) {
        return { id: destinoId.toString(), eliminado: true, destino_reabierto: null };
      }

      const anterior = await tx.destinos.findFirst({
        where: {
          persona_id: asignacion.persona_id,
          fecha_fin: { not: null, ...(asignacion.fecha_inicio ? { lte: asignacion.fecha_inicio } : {}) },
        },
        orderBy: [{ fecha_fin: 'desc' }, { id: 'desc' }],
      });
      // Sin destino anterior no se sabe dónde revistaba antes: la relación queda como está.
      if (!anterior) {
        return { id: destinoId.toString(), eliminado: true, destino_reabierto: null };
      }

      const contiguo =
        !asignacion.fecha_inicio ||
        (anterior.fecha_fin !== null && anterior.fecha_fin >= diaAnterior(asignacion.fecha_inicio));
      if (contiguo) {
        await tx.destinos.update({ where: { id: anterior.id }, data: { fecha_fin: null } });
      }
      if (anterior.unidad_id !== null && anterior.sub_unidad_id !== null) {
        await tx.relaciones_laborales.updateMany({
          where: { persona_id: asignacion.persona_id, fecha_fin: null },
          data: { unidad_id: anterior.unidad_id, sub_unidad_id: anterior.sub_unidad_id },
        });
      }

      return {
        id: destinoId.toString(),
        eliminado: true,
        destino_reabierto: contiguo ? anterior.id.toString() : null,
      };
    });
  }
}

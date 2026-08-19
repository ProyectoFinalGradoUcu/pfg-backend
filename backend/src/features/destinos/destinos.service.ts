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
import { ListUnidadesQueryDto } from './dto/list-unidades-query.dto';
import { ListFuncionariosUnidadQueryDto } from './dto/list-funcionarios-unidad-query.dto';

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
    unidades: { select: { id: true, codigo: true, denominacion: true, tipo: true } },
  };

  /** Filtro de personas compartido por los listados (cédula, nombre o apellido). */
  private filtroPersona(texto: string) {
    return {
      OR: [
        { cedula: { contains: texto, mode: 'insensitive' as const } },
        { primer_nombre: { contains: texto, mode: 'insensitive' as const } },
        { primer_apellido: { contains: texto, mode: 'insensitive' as const } },
      ],
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
      unidad: a.unidades
        ? {
            id: a.unidades.id.toString(),
            codigo: a.unidades.codigo,
            denominacion: a.unidades.denominacion,
            tipo: a.unidades.tipo,
          }
        : null,
      fecha_inicio: soloFecha(a.fecha_inicio),
      fecha_fin: soloFecha(a.fecha_fin),
      posicion_destino: a.posicion_destino,
      numero_orden: a.numero_orden,
      boletin: a.boletin,
      observaciones: a.observaciones,
      activo: esActivo(a.fecha_fin),
    };
  }

  /**
   * Registra un destino. Si el funcionario ya revistaba en otra unidad, el pase
   * cierra esa asignación y abre la nueva en la misma transacción, y deja la
   * relación laboral activa apuntando a la unidad nueva.
   */
  async crearDestino(dto: CreateDestinoDto) {
    if (!dto.numero_orden && !dto.boletin) {
      throw new BadRequestException('Se requiere al menos número de orden o boletín');
    }

    const personaId = BigInt(dto.persona_id);
    const unidadId = BigInt(dto.unidad_id);

    const [persona, unidad] = await Promise.all([
      this.prisma.personas.findUnique({ where: { id: personaId } }),
      this.prisma.unidades.findUnique({ where: { id: unidadId } }),
    ]);
    if (!persona) throw new NotFoundException(`No existe personal con id ${dto.persona_id}`);
    if (!unidad) throw new NotFoundException(`No existe unidad con id ${dto.unidad_id}`);

    const fechaInicio = new Date(dto.fecha_inicio);

    const activo = await this.prisma.destinos.findFirst({
      where: { persona_id: personaId, fecha_fin: null },
    });

    if (activo && activo.unidad_id === unidadId) {
      throw new ConflictException(
        `El funcionario ${dto.persona_id} ya tiene un destino activo en esa unidad`,
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
          fecha_inicio: fechaInicio,
          fecha_fin: null,
          posicion_destino: dto.posicion_destino ?? null,
          numero_orden: dto.numero_orden ?? null,
          boletin: dto.boletin ?? null,
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
        data: { unidad_id: unidadId },
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
    if (query.activo === true) where.fecha_fin = null;
    else if (query.activo === false) where.fecha_fin = { not: null };
    if (query.query) where.personas = this.filtroPersona(query.query);

    const [total, destinosActivos, asignaciones, unidadesActivas] =
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
          where: { fecha_fin: null, unidad_id: { not: null } },
          select: { unidad_id: true },
          distinct: ['unidad_id'],
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
        unidades_con_personal: unidadesActivas.length,
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

  async listarUnidades(query: ListUnidadesQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);

    const where: any = {};
    if (query.query) {
      where.denominacion = { contains: query.query, mode: 'insensitive' };
    }
    if (query.tipo) where.tipo = query.tipo;
    if (query.vigente !== undefined) where.vigente = query.vigente;

    const [total, unidades] = await this.prisma.$transaction([
      this.prisma.unidades.count({ where }),
      this.prisma.unidades.findMany({
        where,
        orderBy: { denominacion: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { destinos: { where: { fecha_fin: null } } } },
        },
      }),
    ]);

    return {
      items: unidades.map((u: any) => ({
        id: u.id.toString(),
        codigo: u.codigo,
        denominacion: u.denominacion,
        tipo: u.tipo,
        vigente: u.vigente,
        total_destinados: u._count.destinos,
      })),
      total,
      page,
      pageSize,
    };
  }

  async listarFuncionariosUnidad(
    unidadId: number,
    query: ListFuncionariosUnidadQueryDto = {},
  ) {
    const unidad = await this.prisma.unidades.findUnique({ where: { id: BigInt(unidadId) } });
    if (!unidad) throw new NotFoundException(`No existe unidad con id ${unidadId}`);

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 200);

    const where: any = { unidad_id: BigInt(unidadId) };
    if (query.activo === true) where.fecha_fin = null;
    else if (query.activo === false) where.fecha_fin = { not: null };
    if (query.query) where.personas = this.filtroPersona(query.query);

    const [total, asignaciones] = await this.prisma.$transaction([
      this.prisma.destinos.count({ where }),
      this.prisma.destinos.findMany({
        where,
        orderBy: [{ fecha_inicio: 'desc' }, { personas: { primer_apellido: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.includeDestino,
      }),
    ]);

    return {
      items: asignaciones.map((a) => this.mapDestino(a)),
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
    if (!ordenFinal && !boletinFinal) {
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

    const actualizado = await this.prisma.destinos.update({
      where: { id: BigInt(destinoId) },
      data: {
        ...(dto.fecha_inicio !== undefined && { fecha_inicio: fechaInicio }),
        ...(dto.fecha_fin !== undefined && { fecha_fin: fechaFin }),
        ...(dto.posicion_destino !== undefined && { posicion_destino: dto.posicion_destino }),
        ...(dto.numero_orden !== undefined && { numero_orden: dto.numero_orden }),
        ...(dto.boletin !== undefined && { boletin: dto.boletin }),
        ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
      },
      include: this.includeDestino,
    });

    return this.mapDestino(actualizado);
  }

  async eliminarDestino(destinoId: number) {
    const asignacion = await this.prisma.destinos.findUnique({
      where: { id: BigInt(destinoId) },
    });
    if (!asignacion) throw new NotFoundException(`No existe destino con id ${destinoId}`);

    await this.prisma.destinos.delete({ where: { id: BigInt(destinoId) } });

    return { id: destinoId.toString(), eliminado: true };
  }
}

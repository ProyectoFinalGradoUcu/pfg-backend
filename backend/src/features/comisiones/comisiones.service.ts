import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service';
import { wherePersonaPorCategoria } from '../../lib/personal/categoria-personal';
import { CreateAsignacionComisionDto, CreateLoteAsignacionesComisionDto, CreateComisionDto, ListComisionesDto, UpdateAsignacionComisionDto, UpdateComisionDto } from './dto/comisiones.dto';

const includeAsignacion = {
  personas: { select: {
    id: true, cedula: true, primer_nombre: true, primer_apellido: true,
    relaciones_laborales: { select: { tipo_funcionario: true, fecha_fin: true }, orderBy: { fecha_inicio: 'desc' as const } },
  } },
  comisiones: { select: { id: true, denominacion: true, vigente: true } },
  relaciones_laborales: { select: { fecha_inicio: true, fecha_fin: true } },
} satisfies Prisma.asignaciones_comisionInclude;
type Asignacion = Prisma.asignaciones_comisionGetPayload<{ include: typeof includeAsignacion }>;
// Una importada sin fecha de fin sigue abierta solo mientras siga abierto el período en que estaba anotada.
const abierta = {
  fecha_fin: null, OR: [{ relacion_laboral_id: null }, { relaciones_laborales: { fecha_fin: null } }],
} satisfies Prisma.asignaciones_comisionWhereInput;
const includeComision = { _count: { select: { asignaciones_comision: { where: abierta } } } };
const fecha = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;
type Comision = Prisma.comisionesGetPayload<{ include: typeof includeComision }>;

@Injectable()
export class ComisionesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapComision(c: Comision) {
    return { id: c.id, denominacion: c.denominacion, vigente: c.vigente, total_integrantes: c._count.asignaciones_comision };
  }
  private mapAsignacion(a: Asignacion) {
    const { relaciones_laborales, ...persona } = a.personas;
    const relacion = relaciones_laborales.find(r => r.fecha_fin === null) ?? relaciones_laborales[0];
    const periodo = a.relaciones_laborales;
    return {
      id: a.id, persona, categoria: relacion?.tipo_funcionario ?? null, comision: a.comisiones, cargo: a.cargo,
      fecha_inicio: fecha(a.fecha_inicio), fecha_fin: fecha(a.fecha_fin), numero_orden: a.numero_orden, boletin: a.boletin,
      activo: a.fecha_fin === null && (!periodo || periodo.fecha_fin === null),
      importada: a.importada, texto_original: a.texto_original,
      periodo: periodo ? { fecha_inicio: fecha(periodo.fecha_inicio), fecha_fin: fecha(periodo.fecha_fin) } : null,
    };
  }
  private async conflicto<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ya existe una comisión con ese nombre o una pertenencia abierta para esta persona y comisión');
      throw error;
    }
  }
  /**
   * Un retirado no puede integrar una comisión. Se considera retirado a quien tiene un
   * retiro no anulado y ninguna relación laboral activa (un reincorporado sí puede).
   */
  private async assertSinRetirados(tx: Prisma.TransactionClient, personaIds: bigint[]) {
    const retirados = await tx.personas.findMany({
      where: {
        id: { in: personaIds },
        retiros: { some: { anulado: false } },
        relaciones_laborales: { none: { fecha_fin: null } },
      },
      select: { primer_nombre: true, primer_apellido: true, cedula: true },
    });
    if (retirados.length) {
      const nombres = retirados.map((p) => `${p.primer_nombre} ${p.primer_apellido} (${p.cedula})`).join(', ');
      throw new ConflictException(
        retirados.length === 1
          ? `${nombres} está retirado: un retirado no puede integrar una comisión.`
          : `Estas personas están retiradas y no pueden integrar una comisión: ${nombres}.`,
      );
    }
  }
  private async bloquear(tx: Prisma.TransactionClient, id: bigint) {
    const rows = await tx.$queryRaw<{ id: bigint; vigente: boolean }[]>`SELECT id, vigente FROM comisiones WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('No existe la comisión');
    return rows[0];
  }
  private valores(dto: UpdateAsignacionComisionDto, original?: { fecha_inicio: Date | null; fecha_fin: Date | null; numero_orden: string | null; boletin: string | null; cargo: string | null; importada: boolean }) {
    const cargo = dto.cargo !== undefined ? dto.cargo?.trim() || null : original?.cargo ?? null;
    const fecha_inicio = dto.fecha_inicio !== undefined ? new Date(dto.fecha_inicio) : original?.fecha_inicio ?? null;
    const fecha_fin = dto.fecha_fin !== undefined ? dto.fecha_fin ? new Date(dto.fecha_fin) : null : original?.fecha_fin ?? null;
    const numero_orden = dto.numero_orden !== undefined ? dto.numero_orden?.trim() || null : original?.numero_orden ?? null;
    const boletin = dto.boletin !== undefined ? dto.boletin?.trim() || null : original?.boletin ?? null;
    // Las importadas del Access pueden quedar sin fecha ni documento hasta que la FAU los complete.
    if (!original?.importada) {
      if (!fecha_inicio) throw new BadRequestException('Ingresá la fecha desde');
      if (!numero_orden && !boletin) throw new BadRequestException('Ingresá al menos el N.º de orden o el boletín');
    }
    if (fecha_fin && fecha_inicio && fecha_fin < fecha_inicio) throw new BadRequestException('La fecha hasta no puede ser anterior a la fecha desde');
    return { fecha_inicio, fecha_fin, numero_orden, boletin, cargo };
  }
  async listar(query: ListComisionesDto) {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 10;
    const where: Prisma.comisionesWhereInput = { ...(query.query && { denominacion: { contains: query.query, mode: 'insensitive' } }), ...(query.vigente !== undefined && { vigente: query.vigente }) };
    const [total, items] = await this.prisma.$transaction([this.prisma.comisiones.count({ where }), this.prisma.comisiones.findMany({ where, include: includeComision, orderBy: [{ denominacion: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize })]);
    return { items: items.map(c => this.mapComision(c)), total, page, pageSize };
  }
  async obtener(id: bigint) {
    const c = await this.prisma.comisiones.findUnique({ where: { id }, include: includeComision });
    if (!c) throw new NotFoundException('No existe la comisión');
    return this.mapComision(c);
  }
  async crear(dto: CreateComisionDto) {
    return this.conflicto(async () => this.mapComision(await this.prisma.comisiones.create({ data: { denominacion: dto.denominacion }, include: includeComision })));
  }
  async editar(id: bigint, dto: UpdateComisionDto) {
    if (!Object.keys(dto).length || dto.denominacion === null) throw new BadRequestException('Ingresá los campos a modificar');
    return this.conflicto(() => this.prisma.$transaction(async tx => {
      await this.bloquear(tx, id);
      if (dto.vigente === false && await tx.asignaciones_comision.count({ where: { comision_id: id, ...abierta } })) throw new ConflictException('Cerrá las pertenencias abiertas antes de inactivar la comisión');
      return this.mapComision(await tx.comisiones.update({ where: { id }, data: dto, include: includeComision }));
    }));
  }
  async listarAsignaciones(query: ListComisionesDto) {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 10;
    const persona: Prisma.personasWhereInput = {
      ...(query.query && { OR: ['cedula', 'primer_nombre', 'primer_apellido'].map(campo => ({ [campo]: { contains: query.query, mode: 'insensitive' } })) }),
      ...(query.categoria && { AND: [wherePersonaPorCategoria(query.categoria)] }),
    };
    const where: Prisma.asignaciones_comisionWhereInput = {
      ...(query.comision_id && { comision_id: BigInt(query.comision_id) }), ...(query.persona_id && { persona_id: BigInt(query.persona_id) }),
      ...(query.activo !== undefined && (query.activo ? abierta : { NOT: abierta })),
      ...((query.query || query.categoria) && { personas: persona }),
    };
    const [total, items, abiertas, comisiones] = await this.prisma.$transaction([
      this.prisma.asignaciones_comision.count({ where }),
      this.prisma.asignaciones_comision.findMany({ where, include: includeAsignacion, orderBy: [{ fecha_inicio: { sort: 'desc', nulls: 'last' } }, { personas: { primer_apellido: 'asc' } }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.asignaciones_comision.count({ where: abierta }),
      this.prisma.comisiones.count({ where: { asignaciones_comision: { some: abierta } } }),
    ]);
    return { items: items.map(a => this.mapAsignacion(a)), total, page, pageSize, stats: { total_asignaciones: total, asignaciones_activas: abiertas, comisiones_con_personal: comisiones } };
  }
  async funcionarios(id: bigint, query: ListComisionesDto) {
    await this.obtener(id);
    const { stats, ...lista } = await this.listarAsignaciones({ ...query, comision_id: Number(id) });
    return lista;
  }
  async obtenerAsignacion(id: bigint) {
    const a = await this.prisma.asignaciones_comision.findUnique({ where: { id }, include: includeAsignacion });
    if (!a) throw new NotFoundException('No existe la asignación');
    return this.mapAsignacion(a);
  }
  async crearAsignacion(dto: CreateAsignacionComisionDto) {
    const valores = this.valores(dto);
    return this.conflicto(() => this.prisma.$transaction(async tx => {
      const c = await this.bloquear(tx, BigInt(dto.comision_id));
      if (!c.vigente) throw new ConflictException('La comisión está inactiva');
      if (!await tx.personas.findUnique({ where: { id: BigInt(dto.persona_id) }, select: { id: true } })) throw new NotFoundException('No existe la persona');
      await this.assertSinRetirados(tx, [BigInt(dto.persona_id)]);
      // El índice único no cubre las importadas, que pueden seguir abiertas por su período.
      if (!valores.fecha_fin && await tx.asignaciones_comision.count({ where: { persona_id: BigInt(dto.persona_id), comision_id: BigInt(dto.comision_id), ...abierta } })) {
        throw new ConflictException('La persona ya tiene una pertenencia abierta en esta comisión');
      }
      return this.mapAsignacion(await tx.asignaciones_comision.create({ data: { ...valores, persona_id: BigInt(dto.persona_id), comision_id: BigInt(dto.comision_id) }, include: includeAsignacion }));
    }));
  }
  async crearLote(dto: CreateLoteAsignacionesComisionDto) {
    if (dto.persona_ids.length > 1 && dto.cargo?.trim()) {
      throw new BadRequestException('El cargo debe cargarse individualmente cuando se asignan varias personas');
    }
    const valores = this.valores(dto);
    return this.conflicto(() => this.prisma.$transaction(async tx => {
      const comisionId = BigInt(dto.comision_id);
      const c = await this.bloquear(tx, comisionId);
      if (!c.vigente) throw new ConflictException('La comisión está inactiva');
      const ids = dto.persona_ids.map(id => BigInt(id));
      const personas = await tx.personas.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const existentes = new Set(personas.map(p => p.id.toString()));
      const faltantes = ids.filter(id => !existentes.has(id.toString()));
      if (faltantes.length) throw new NotFoundException(`No existe personal con id ${faltantes.join(', ')}`);
      await this.assertSinRetirados(tx, ids);
      if (!valores.fecha_fin) {
        const duplicadas = await tx.asignaciones_comision.findMany({
          where: { comision_id: comisionId, persona_id: { in: ids }, ...abierta },
          select: { personas: { select: { primer_nombre: true, primer_apellido: true, cedula: true } } },
        });
        if (duplicadas.length) throw new ConflictException(`Ya tienen una pertenencia abierta en esta comisión: ${duplicadas.map(a => `${a.personas.primer_nombre} ${a.personas.primer_apellido} (${a.personas.cedula})`).join(', ')}`);
      }
      const items: ReturnType<ComisionesService['mapAsignacion']>[] = [];
      for (const persona_id of ids) {
        const creada = await tx.asignaciones_comision.create({ data: { ...valores, persona_id, comision_id: comisionId }, include: includeAsignacion });
        items.push(this.mapAsignacion(creada));
      }
      return { items, cantidad: items.length };
    }, { timeout: 30000 }));
  }
  async editarAsignacion(id: bigint, dto: UpdateAsignacionComisionDto) {
    if (!Object.keys(dto).length) throw new BadRequestException('Ingresá los campos a modificar');
    return this.conflicto(() => this.prisma.$transaction(async tx => {
      const ref = await tx.asignaciones_comision.findUnique({ where: { id } });
      if (!ref) throw new NotFoundException('No existe la asignación');
      const c = await this.bloquear(tx, ref.comision_id);
      // Leer después del bloqueo evita perder una edición concurrente de esta comisión.
      const original = await tx.asignaciones_comision.findUnique({ where: { id } });
      if (!original) throw new NotFoundException('No existe la asignación');
      const valores = this.valores(dto, original);
      if (!valores.fecha_fin && !c.vigente) throw new ConflictException('La comisión está inactiva');
      // Reabrir la pertenencia de un retirado equivale a volver a asignarlo.
      if (!valores.fecha_fin && original.fecha_fin) await this.assertSinRetirados(tx, [original.persona_id]);
      return this.mapAsignacion(await tx.asignaciones_comision.update({ where: { id }, data: valores, include: includeAsignacion }));
    }));
  }
  async eliminarAsignacion(id: bigint) {
    return this.prisma.$transaction(async tx => {
      const ref = await tx.asignaciones_comision.findUnique({ where: { id } });
      if (!ref) throw new NotFoundException('No existe la asignación');
      await this.bloquear(tx, ref.comision_id);
      const borrado = await tx.asignaciones_comision.deleteMany({ where: { id } });
      if (!borrado.count) throw new NotFoundException('No existe la asignación');
      return { id, eliminado: true };
    });
  }
}

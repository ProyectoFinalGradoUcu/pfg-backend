import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service';
import { wherePersonaPorCategoria } from '../../lib/personal/categoria-personal';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { wherePersonasPorAlcance } from '../../lib/alcance/alcance.where';
import { hoyComisiones, pertenenciaActiva, personaPuedeIntegrar, periodoPertenencia, periodosSolapados, wherePertenenciaActiva } from './pertenencias';
import { CreateAsignacionComisionDto, CreateLoteAsignacionesComisionDto, CreateComisionDto, ListComisionesDto, UpdateAsignacionComisionDto, UpdateComisionDto } from './dto/comisiones.dto';

const includeAsignacion = {
  personas: { select: {
    id: true, cedula: true, primer_nombre: true, primer_apellido: true,
    relaciones_laborales: { select: { tipo_funcionario: true, fecha_fin: true }, orderBy: { fecha_inicio: 'desc' as const } },
    retiros: { select: { anulado: true } },
  } },
  comisiones: { select: { id: true, denominacion: true, vigente: true } },
  relaciones_laborales: { select: { fecha_inicio: true, fecha_fin: true } },
} satisfies Prisma.asignaciones_comisionInclude;
type Asignacion = Prisma.asignaciones_comisionGetPayload<{ include: typeof includeAsignacion }>;
const incluirComision = (alcance?: AlcanceResuelto) => ({ _count: { select: { asignaciones_comision: { where: {
  ...wherePertenenciaActiva(), ...(alcance && { personas: wherePersonasPorAlcance(alcance) }),
} } } } });
const fecha = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;
type Comision = Prisma.comisionesGetPayload<{ include: ReturnType<typeof incluirComision> }>;

@Injectable()
export class ComisionesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapComision(c: Comision) {
    return { id: c.id, denominacion: c.denominacion, vigente: c.vigente, total_integrantes: c._count.asignaciones_comision };
  }
  private mapAsignacion(a: Asignacion) {
    const { relaciones_laborales, retiros, ...persona } = a.personas;
    const relacion = relaciones_laborales.find(r => r.fecha_fin === null) ?? relaciones_laborales[0];
    const periodo = a.relaciones_laborales;
    return {
      id: a.id, persona, categoria: relacion?.tipo_funcionario ?? null, comision: a.comisiones, cargo: a.cargo,
      fecha_inicio: fecha(a.fecha_inicio), fecha_fin: fecha(a.fecha_fin), numero_orden: a.numero_orden, boletin: a.boletin,
      activo: pertenenciaActiva(a) && personaPuedeIntegrar(a.personas),
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
  private async bloquearPersonas(tx: Prisma.TransactionClient, ids: bigint[]) {
    // Orden fijo y misma cerradura que Retiros: no puede entrar un alta mientras se retira a la persona.
    await tx.$queryRaw`SELECT id FROM personas WHERE id IN (${Prisma.join([...new Set(ids)].sort((a, b) => a < b ? -1 : 1))}) ORDER BY id FOR UPDATE`;
  }
  private async assertPersonasEnAlcance(tx: Prisma.TransactionClient, ids: bigint[], alcance?: AlcanceResuelto) {
    if (!alcance || alcance.tipo === 'global') return;
    const personas = await tx.personas.findMany({
      where: { id: { in: ids }, ...wherePersonasPorAlcance(alcance) }, select: { id: true },
    });
    if (personas.length !== new Set(ids).size) throw new NotFoundException('Persona no encontrada');
  }
  private async assertSinSolapamientos(tx: Prisma.TransactionClient, comisionId: bigint, ids: bigint[], valores: { fecha_inicio: Date | null; fecha_fin: Date | null }, excluir?: bigint, periodo?: { fecha_inicio: Date; fecha_fin: Date | null } | null) {
    const otras = await tx.asignaciones_comision.findMany({
      where: { comision_id: comisionId, persona_id: { in: ids }, ...(excluir && { id: { not: excluir } }) },
      include: { relaciones_laborales: { select: { fecha_inicio: true, fecha_fin: true } } },
    });
    if (otras.some(a => periodosSolapados(a, { ...valores, relaciones_laborales: periodo }))) {
      throw new ConflictException('La persona ya tiene una pertenencia en esta comisión con fechas solapadas. El fin de la anterior debe ser menor que el inicio de la siguiente, aunque cambien cargo, orden o boletín.');
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
  async listar(query: ListComisionesDto, alcance?: AlcanceResuelto) {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 10;
    const where: Prisma.comisionesWhereInput = { ...(query.query && { denominacion: { contains: query.query, mode: 'insensitive' } }), ...(query.vigente !== undefined && { vigente: query.vigente }) };
    const [total, items] = await this.prisma.$transaction([this.prisma.comisiones.count({ where }), this.prisma.comisiones.findMany({ where, include: incluirComision(alcance), orderBy: [{ denominacion: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize })]);
    return { items: items.map(c => this.mapComision(c)), total, page, pageSize };
  }
  async obtener(id: bigint, alcance?: AlcanceResuelto) {
    const c = await this.prisma.comisiones.findUnique({ where: { id }, include: incluirComision(alcance) });
    if (!c) throw new NotFoundException('No existe la comisión');
    return this.mapComision(c);
  }
  async crear(dto: CreateComisionDto) {
    return this.conflicto(async () => this.mapComision(await this.prisma.comisiones.create({ data: { denominacion: dto.denominacion }, include: incluirComision() })));
  }
  async editar(id: bigint, dto: UpdateComisionDto) {
    if (!Object.keys(dto).length || dto.denominacion === null) throw new BadRequestException('Ingresá los campos a modificar');
    return this.conflicto(() => this.prisma.$transaction(async tx => {
      await this.bloquear(tx, id);
      if (dto.vigente === false && await tx.asignaciones_comision.count({ where: { comision_id: id, OR: [{ fecha_fin: null }, { fecha_fin: { gte: hoyComisiones() } }], AND: [{ OR: [{ relacion_laboral_id: null }, { relaciones_laborales: { OR: [{ fecha_fin: null }, { fecha_fin: { gte: hoyComisiones() } }] } }] }] } })) throw new ConflictException('Cerrá las pertenencias vigentes o futuras antes de inactivar la comisión');
      return this.mapComision(await tx.comisiones.update({ where: { id }, data: dto, include: incluirComision() }));
    }));
  }
  async listarAsignaciones(query: ListComisionesDto, alcance?: AlcanceResuelto) {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 10;
    const persona: Prisma.personasWhereInput = {
      ...(alcance && wherePersonasPorAlcance(alcance)),
      ...(query.query && { OR: ['cedula', 'primer_nombre', 'primer_apellido'].map(campo => ({ [campo]: { contains: query.query, mode: 'insensitive' } })) }),
      ...(query.categoria && { AND: [wherePersonaPorCategoria(query.categoria)] }),
    };
    const where: Prisma.asignaciones_comisionWhereInput = {
      ...(query.comision_id && { comision_id: BigInt(query.comision_id) }), ...(query.persona_id && { persona_id: BigInt(query.persona_id) }),
      ...(query.activo !== undefined && (query.activo ? wherePertenenciaActiva() : { NOT: wherePertenenciaActiva() })),
      personas: persona,
    };
    const [total, items, abiertas, comisiones] = await this.prisma.$transaction([
      this.prisma.asignaciones_comision.count({ where }),
      this.prisma.asignaciones_comision.findMany({ where, include: includeAsignacion, orderBy: [{ fecha_inicio: { sort: 'desc', nulls: 'last' } }, { personas: { primer_apellido: 'asc' } }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
       this.prisma.asignaciones_comision.count({ where: { ...wherePertenenciaActiva(), ...(alcance && { personas: wherePersonasPorAlcance(alcance) }) } }),
       this.prisma.comisiones.count({ where: { asignaciones_comision: { some: { ...wherePertenenciaActiva(), ...(alcance && { personas: wherePersonasPorAlcance(alcance) }) } } } }),
    ]);
    return { items: items.map(a => this.mapAsignacion(a)), total, page, pageSize, stats: { total_asignaciones: total, asignaciones_activas: abiertas, comisiones_con_personal: comisiones } };
  }
  async funcionarios(id: bigint, query: ListComisionesDto, alcance?: AlcanceResuelto) {
    await this.obtener(id, alcance);
    const { stats, ...lista } = await this.listarAsignaciones({ ...query, comision_id: Number(id) }, alcance);
    return lista;
  }
  async obtenerAsignacion(id: bigint, alcance?: AlcanceResuelto) {
    const a = await this.prisma.asignaciones_comision.findFirst({ where: { id, ...(alcance && { personas: wherePersonasPorAlcance(alcance) }) }, include: includeAsignacion });
    if (!a) throw new NotFoundException('No existe la asignación');
    return this.mapAsignacion(a);
  }
  async crearAsignacion(dto: CreateAsignacionComisionDto, alcance?: AlcanceResuelto) {
    const valores = this.valores(dto);
    return this.conflicto(() => this.prisma.$transaction(async tx => {
      await this.bloquearPersonas(tx, [BigInt(dto.persona_id)]);
      await this.assertPersonasEnAlcance(tx, [BigInt(dto.persona_id)], alcance);
      const c = await this.bloquear(tx, BigInt(dto.comision_id));
      if (!c.vigente) throw new ConflictException('La comisión está inactiva');
      if (!await tx.personas.findUnique({ where: { id: BigInt(dto.persona_id) }, select: { id: true } })) throw new NotFoundException('No existe la persona');
      await this.assertSinRetirados(tx, [BigInt(dto.persona_id)]);
      await this.assertSinSolapamientos(tx, BigInt(dto.comision_id), [BigInt(dto.persona_id)], valores);
      return this.mapAsignacion(await tx.asignaciones_comision.create({ data: { ...valores, persona_id: BigInt(dto.persona_id), comision_id: BigInt(dto.comision_id) }, include: includeAsignacion }));
    }));
  }
  async crearLote(dto: CreateLoteAsignacionesComisionDto, alcance?: AlcanceResuelto) {
    if (dto.persona_ids.length > 1 && dto.cargo?.trim()) {
      throw new BadRequestException('El cargo debe cargarse individualmente cuando se asignan varias personas');
    }
    const valores = this.valores(dto);
    return this.conflicto(() => this.prisma.$transaction(async tx => {
      const comisionId = BigInt(dto.comision_id);
      const ids = dto.persona_ids.map(id => BigInt(id));
      await this.bloquearPersonas(tx, ids);
      await this.assertPersonasEnAlcance(tx, ids, alcance);
      const c = await this.bloquear(tx, comisionId);
      if (!c.vigente) throw new ConflictException('La comisión está inactiva');
      const personas = await tx.personas.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const existentes = new Set(personas.map(p => p.id.toString()));
      const faltantes = ids.filter(id => !existentes.has(id.toString()));
      if (faltantes.length) throw new NotFoundException(`No existe personal con id ${faltantes.join(', ')}`);
      await this.assertSinRetirados(tx, ids);
      await this.assertSinSolapamientos(tx, comisionId, ids, valores);
      const items: ReturnType<ComisionesService['mapAsignacion']>[] = [];
      for (const persona_id of ids) {
        const creada = await tx.asignaciones_comision.create({ data: { ...valores, persona_id, comision_id: comisionId }, include: includeAsignacion });
        items.push(this.mapAsignacion(creada));
      }
      return { items, cantidad: items.length };
    }, { timeout: 30000 }));
  }
  async editarAsignacion(id: bigint, dto: UpdateAsignacionComisionDto, alcance?: AlcanceResuelto) {
    if (!Object.keys(dto).length) throw new BadRequestException('Ingresá los campos a modificar');
    return this.conflicto(() => this.prisma.$transaction(async tx => {
      const ref = await tx.asignaciones_comision.findUnique({ where: { id } });
      if (!ref) throw new NotFoundException('No existe la asignación');
      await this.bloquearPersonas(tx, [ref.persona_id]);
      await this.assertPersonasEnAlcance(tx, [ref.persona_id], alcance);
      const c = await this.bloquear(tx, ref.comision_id);
      // Leer después del bloqueo evita perder una edición concurrente de esta comisión.
      const original = await tx.asignaciones_comision.findUnique({ where: { id } });
      if (!original) throw new NotFoundException('No existe la asignación');
      const valores = this.valores(dto, original);
      const periodo = original.relacion_laboral_id ? await tx.relaciones_laborales.findUnique({ where: { id: original.relacion_laboral_id }, select: { fecha_inicio: true, fecha_fin: true } }) : null;
      const termina = periodoPertenencia({ ...valores, relaciones_laborales: periodo }).fecha_fin;
      const vigenteOFutura = !termina || termina >= hoyComisiones();
      if (vigenteOFutura && !c.vigente) throw new ConflictException('La comisión está inactiva');
      if (vigenteOFutura) await this.assertSinRetirados(tx, [original.persona_id]);
      await this.assertSinSolapamientos(tx, ref.comision_id, [ref.persona_id], valores, id, periodo);
      return this.mapAsignacion(await tx.asignaciones_comision.update({ where: { id }, data: valores, include: includeAsignacion }));
    }));
  }
  async eliminarAsignacion(id: bigint, alcance?: AlcanceResuelto) {
    return this.prisma.$transaction(async tx => {
      const ref = await tx.asignaciones_comision.findUnique({ where: { id } });
      if (!ref) throw new NotFoundException('No existe la asignación');
      await this.bloquearPersonas(tx, [ref.persona_id]);
      await this.assertPersonasEnAlcance(tx, [ref.persona_id], alcance);
      await this.bloquear(tx, ref.comision_id);
      const borrado = await tx.asignaciones_comision.deleteMany({ where: { id } });
      if (!borrado.count) throw new NotFoundException('No existe la asignación');
      return { id, eliminado: true };
    });
  }
}

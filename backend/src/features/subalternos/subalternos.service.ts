import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import { CreateSubalternoDto } from './dto/create-subalterno.dto.js';
import { CreatePersonalDto } from './dto/create-personal.dto.js';
import { UpdateSubalternoDto } from './dto/update-subalterno.dto.js';
import { ListPersonasQueryDto } from './dto/list-personas-query.dto.js';
import { assertFechaInicioPosteriorANacimiento } from './validaciones-fechas.js';

const FK_MENSAJES: Record<string, string> = {
  relaciones_laborales_situacion_id_fkey: 'situacion_id no existe en la tabla de situaciones',
  relaciones_laborales_regimen_id_fkey: 'regimen_id no existe en la tabla de regímenes',
  relaciones_laborales_unidad_id_fkey: 'unidad_id no existe en la tabla de unidades',
  relaciones_laborales_programa_id_fkey: 'programa_id no existe en la tabla de programas',
  relaciones_laborales_escalafon_id_fkey: 'escalafon_id no existe en la tabla de escalafones',
  relaciones_laborales_grado_id_fkey: 'grado_id no existe en la tabla de grados',
  relaciones_laborales_sub_unidad_id_fkey: 'sub_unidad_id no existe en la tabla de sub-unidades',
  relaciones_familiares_familiar_id_fkey: 'familiar_id no existe en personas',
};

function mensajeFK(err: unknown): string {
  const e = err as Record<string, unknown>;

  const meta = e?.['meta'] as Record<string, unknown> | undefined;
  const fromMeta = String(meta?.['field_name'] ?? '').split(' ')[0];

  const message = String(e?.['message'] ?? '');
  const match = message.match(/on the constraint:\s*`([^`]+)`/);
  const fromMessage = match?.[1] ?? '';

  const constraint = fromMeta || fromMessage;
  return FK_MENSAJES[constraint] ?? `Referencia inválida en el campo: ${constraint || 'desconocido'}`;
}

@Injectable()
export class SubalternosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPersonas(query: ListPersonasQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);

    const relacionWhere = {
      fecha_fin: null as null,
      ...(query.estado && { situacion_id: BigInt(query.estado) }),
      ...(query.rango && { grado_id: BigInt(query.rango) }),
      ...(query.destino && { unidad_id: BigInt(query.destino) }),
    };

    const where = {
      relaciones_laborales: { some: relacionWhere },
      ...(query.search && {
        OR: [
          { cedula: { contains: query.search, mode: 'insensitive' as const } },
          {
            primer_nombre: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
          {
            primer_apellido: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
          {
            segundo_nombre: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
          {
            segundo_apellido: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };

    const [total, personas] = await Promise.all([
      this.prisma.personas.count({ where }),
      this.prisma.personas.findMany({
        where,
        orderBy: [{ primer_apellido: 'asc' }, { primer_nombre: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          cedula: true,
          primer_nombre: true,
          segundo_nombre: true,
          primer_apellido: true,
          segundo_apellido: true,
          relaciones_laborales: {
            where: { fecha_fin: null },
            orderBy: { fecha_inicio: 'desc' },
            take: 1,
            select: {
              grados: { select: { denominacion: true } },
              unidades: { select: { denominacion: true } },
              situaciones: { select: { denominacion: true } },
            },
          },
        },
      }),
    ]);

    return {
      items: personas.map((p) => {
        const rel = p.relaciones_laborales[0] ?? null;
        const nombre = [
          p.primer_nombre,
          p.segundo_nombre,
          p.primer_apellido,
          p.segundo_apellido,
        ]
          .filter(Boolean)
          .join(' ');
        return {
          id: p.id.toString(),
          nombre,
          cedula: p.cedula,
          rango: rel?.grados?.denominacion ?? null,
          destino: rel?.unidades?.denominacion ?? null,
          estado: rel?.situaciones?.denominacion ?? null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateSubalternoDto) {
    assertFechaInicioPosteriorANacimiento(dto.fecha_inicio, dto.fecha_nacimiento);

    const existe = await this.prisma.personas.findUnique({
      where: { cedula: dto.cedula },
    });
    if (existe) {
      throw new ConflictException(
        `Ya existe una persona con cédula ${dto.cedula}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const persona = await tx.personas.create({
        data: {
          cedula: dto.cedula,
          primer_nombre: dto.primer_nombre,
          primer_apellido: dto.primer_apellido,
          segundo_nombre: dto.segundo_nombre,
          segundo_apellido: dto.segundo_apellido,
          fecha_nacimiento: dto.fecha_nacimiento
            ? new Date(dto.fecha_nacimiento)
            : undefined,
          email: dto.email,
          telefono: dto.telefono,
          direccion: dto.direccion,
          genero: dto.genero,
          estado_civil: dto.estado_civil,
          lugar_nacimiento: dto.lugar_nacimiento,
        },
      });

      const relacion = await tx.relaciones_laborales.create({
        data: {
          persona_id: persona.id,
          regimen_id: BigInt(dto.regimen_id),
          unidad_id: BigInt(dto.unidad_id),
          programa_id: BigInt(dto.programa_id),
          situacion_id: BigInt(dto.situacion_id),
          escalafon_id: BigInt(dto.escalafon_id),
          grado_id: BigInt(dto.grado_id),
          fecha_inicio: new Date(dto.fecha_inicio),
          estado: 'activo',
          tipo_funcionario: 'subalterno',
          sub_unidad_id: dto.sub_unidad_id
            ? BigInt(dto.sub_unidad_id)
            : undefined,
          observaciones: dto.observaciones,
        },
      });

      return {
        id: Number(persona.id),
        cedula: persona.cedula,
        primer_nombre: persona.primer_nombre,
        primer_apellido: persona.primer_apellido,
        segundo_nombre: persona.segundo_nombre,
        segundo_apellido: persona.segundo_apellido,
        fecha_nacimiento: persona.fecha_nacimiento,
        email: persona.email,
        telefono: persona.telefono,
        direccion: persona.direccion,
        genero: persona.genero,
        estado_civil: persona.estado_civil,
        lugar_nacimiento: persona.lugar_nacimiento,
        relacion_laboral: {
          id: Number(relacion.id),
          tipo_funcionario: relacion.tipo_funcionario,
          estado: relacion.estado,
          fecha_inicio: relacion.fecha_inicio,
          escalafon_id: Number(relacion.escalafon_id),
          grado_id: Number(relacion.grado_id),
          regimen_id: Number(relacion.regimen_id),
          unidad_id: Number(relacion.unidad_id),
          programa_id: Number(relacion.programa_id),
          situacion_id: Number(relacion.situacion_id),
        },
      };
    });
  }

  async createPersonal(dto: CreatePersonalDto) {
    const existe = await this.prisma.personas.findUnique({
      where: { cedula: dto.cedula },
    });
    if (existe) {
      throw new ConflictException(
        `Ya existe una persona con cédula ${dto.cedula}`,
      );
    }

    if (dto.es_civil) {
      return this.createPersonalCivil(dto);
    }
    return this.createPersonalMilitar(dto);
  }

  private async createPersonalCivil(dto: CreatePersonalDto) {
    if (!dto.familiares || dto.familiares.length === 0) {
      throw new BadRequestException(
        'El personal civil debe tener al menos un familiar militar asociado (familiares requerido)',
      );
    }

    type PersonaFamiliar = { id: bigint; cedula: string; primer_nombre: string; primer_apellido: string; es_civil: boolean | null };
    const cedulasFamiliares = dto.familiares.map((f) => f.cedula);
    const personasEncontradas = (await this.prisma.personas.findMany({
      where: { cedula: { in: cedulasFamiliares } },
      select: { id: true, cedula: true, primer_nombre: true, primer_apellido: true, es_civil: true },
    })) as unknown as PersonaFamiliar[];
    const porCedula = new Map(personasEncontradas.map((p) => [p.cedula, p]));
    for (const f of dto.familiares) {
      const persona = porCedula.get(f.cedula);
      if (!persona) throw new BadRequestException(`No existe ningún personal registrado con cédula ${f.cedula}`);
      if (persona.es_civil) throw new BadRequestException(`El familiar con cédula ${f.cedula} es civil. Debe ser un oficial o subalterno`);
    }
    const familiaresResueltos = dto.familiares.map((f) => ({ ...porCedula.get(f.cedula)!, tipo_relacion: f.tipo_relacion }));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const persona = await tx.personas.create({
          data: {
            cedula: dto.cedula,
            primer_nombre: dto.primer_nombre,
            primer_apellido: dto.primer_apellido,
            segundo_nombre: dto.segundo_nombre,
            segundo_apellido: dto.segundo_apellido,
            fecha_nacimiento: dto.fecha_nacimiento
              ? new Date(dto.fecha_nacimiento)
              : undefined,
            email: dto.email,
            telefono: dto.telefono,
            direccion: dto.direccion,
            genero: dto.genero,
            estado_civil: dto.estado_civil,
            lugar_nacimiento: dto.lugar_nacimiento,
            etnia: dto.etnia,
            codigo_postal: dto.codigo_postal,
            seccional: dto.seccional,
            es_civil: true,
          },
        });

        await tx.relaciones_familiares.createMany({
          data: familiaresResueltos.map((f) => ({
            persona_id: persona.id,
            familiar_id: f.id,
            tipo_relacion: f.tipo_relacion ?? null,
          })),
        });

        return {
          id: Number(persona.id),
          cedula: persona.cedula,
          primer_nombre: persona.primer_nombre,
          primer_apellido: persona.primer_apellido,
          segundo_nombre: persona.segundo_nombre,
          segundo_apellido: persona.segundo_apellido,
          fecha_nacimiento: persona.fecha_nacimiento,
          email: persona.email,
          telefono: persona.telefono,
          direccion: persona.direccion,
          genero: persona.genero,
          estado_civil: persona.estado_civil,
          lugar_nacimiento: persona.lugar_nacimiento,
          etnia: persona.etnia,
          codigo_postal: persona.codigo_postal,
          seccional: persona.seccional,
          es_civil: true,
          observaciones: dto.observaciones ?? null,
          familiares: familiaresResueltos.map((f) => ({
            id: Number(f.id),
            cedula: f.cedula,
            nombre: `${f.primer_nombre} ${f.primer_apellido}`,
            tipo_relacion: f.tipo_relacion ?? null,
          })),
        };
      });
    } catch (err: unknown) {
      const code = (err as Record<string, unknown>)?.['code'];
      if (code === 'P2003') {
        throw new BadRequestException(mensajeFK(err));
      }
      throw err;
    }
  }

  private async createPersonalMilitar(dto: CreatePersonalDto) {
    const camposFaltantes = (
      ['tipo_funcionario', 'regimen_id', 'unidad_id', 'programa_id', 'situacion_id', 'escalafon_id', 'grado_id', 'fecha_inicio'] as const
    ).filter((campo) => dto[campo] == null);

    if (camposFaltantes.length > 0) {
      throw new BadRequestException(
        `Campos requeridos para personal militar faltantes: ${camposFaltantes.join(', ')}`,
      );
    }

    assertFechaInicioPosteriorANacimiento(dto.fecha_inicio, dto.fecha_nacimiento);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const persona = await tx.personas.create({
          data: {
            cedula: dto.cedula,
            primer_nombre: dto.primer_nombre,
            primer_apellido: dto.primer_apellido,
            segundo_nombre: dto.segundo_nombre,
            segundo_apellido: dto.segundo_apellido,
            fecha_nacimiento: dto.fecha_nacimiento
              ? new Date(dto.fecha_nacimiento)
              : undefined,
            email: dto.email,
            telefono: dto.telefono,
            direccion: dto.direccion,
            genero: dto.genero,
            estado_civil: dto.estado_civil,
            lugar_nacimiento: dto.lugar_nacimiento,
            etnia: dto.etnia,
            codigo_postal: dto.codigo_postal,
            seccional: dto.seccional,
            es_civil: false,
          },
        });

        const relacion = await tx.relaciones_laborales.create({
          data: {
            persona_id: persona.id,
            regimen_id: BigInt(dto.regimen_id!),
            unidad_id: BigInt(dto.unidad_id!),
            programa_id: BigInt(dto.programa_id!),
            situacion_id: BigInt(dto.situacion_id!),
            escalafon_id: BigInt(dto.escalafon_id!),
            grado_id: BigInt(dto.grado_id!),
            fecha_inicio: new Date(dto.fecha_inicio!),
            estado: 'activo',
            tipo_funcionario: dto.tipo_funcionario,
            sub_unidad_id: dto.sub_unidad_id ? BigInt(dto.sub_unidad_id) : undefined,
            prima_tecnica: dto.prima_tecnica,
            tiene_mando: dto.tiene_mando,
            observaciones: dto.observaciones,
          },
          include: {
            grados: { select: { denominacion: true } },
            escalafones: { select: { denominacion: true } },
            unidades: { select: { denominacion: true } },
            programas: { select: { denominacion: true } },
            situaciones: { select: { denominacion: true } },
            regimenes: { select: { denominacion: true } },
            sub_unidades: { select: { denominacion: true } },
          },
        });

        return {
          id: Number(persona.id),
          cedula: persona.cedula,
          primer_nombre: persona.primer_nombre,
          primer_apellido: persona.primer_apellido,
          segundo_nombre: persona.segundo_nombre,
          segundo_apellido: persona.segundo_apellido,
          fecha_nacimiento: persona.fecha_nacimiento,
          email: persona.email,
          telefono: persona.telefono,
          direccion: persona.direccion,
          genero: persona.genero,
          estado_civil: persona.estado_civil,
          lugar_nacimiento: persona.lugar_nacimiento,
          etnia: persona.etnia,
          codigo_postal: persona.codigo_postal,
          seccional: persona.seccional,
          es_civil: false,
          relacion_laboral: {
            id: Number(relacion.id),
            tipo_funcionario: relacion.tipo_funcionario,
            estado: relacion.estado,
            fecha_inicio: relacion.fecha_inicio,
            prima_tecnica: relacion.prima_tecnica,
            tiene_mando: relacion.tiene_mando,
            observaciones: relacion.observaciones,
            escalafon_id: Number(relacion.escalafon_id),
            escalafon: relacion.escalafones.denominacion,
            grado_id: Number(relacion.grado_id),
            grado: relacion.grados.denominacion,
            regimen_id: Number(relacion.regimen_id),
            regimen: relacion.regimenes.denominacion,
            unidad_id: Number(relacion.unidad_id),
            unidad: relacion.unidades.denominacion,
            programa_id: Number(relacion.programa_id),
            programa: relacion.programas.denominacion,
            situacion_id: Number(relacion.situacion_id),
            situacion: relacion.situaciones.denominacion,
            sub_unidad_id: relacion.sub_unidad_id ? Number(relacion.sub_unidad_id) : null,
            sub_unidad: relacion.sub_unidades?.denominacion ?? null,
          },
        };
      });
    } catch (err: unknown) {
      const code = (err as Record<string, unknown>)?.['code'];
      if (code === 'P2003') {
        throw new BadRequestException(
          mensajeFK(err),
        );
      }
      throw err;
    }
  }

  async update(id: number, dto: UpdateSubalternoDto) {
    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
    });
    if (!persona) {
      throw new NotFoundException(`No existe subalterno con id ${id}`);
    }

    const actualizada = await this.prisma.personas.update({
      where: { id: BigInt(id) },
      data: {
        direccion: dto.direccion,
        telefono: dto.telefono,
      },
    });

    return {
      id: Number(actualizada.id),
      cedula: actualizada.cedula,
      direccion: actualizada.direccion,
      telefono: actualizada.telefono,
    };
  }

  async remove(id: number) {
    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
    });
    if (!persona) {
      throw new NotFoundException(`No existe subalterno con id ${id}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.relaciones_laborales.deleteMany({
        where: { persona_id: BigInt(id) },
      });
      await tx.personas.delete({
        where: { id: BigInt(id) },
      });
    });

    return { id, eliminado: true };
  }
}

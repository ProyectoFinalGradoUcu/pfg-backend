import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import { APLICACION } from '../../lib/aplicacion.const';
import { ListUnidadesQueryDto } from './dto/list-unidades-query.dto';
import { CreateUnidadDto } from './dto/create-unidad.dto';
import { UpdateUnidadDto } from './dto/update-unidad.dto';

type RolConPermisos = {
  id: bigint;
  nombre: string;
  descripcion: string | null;
  roles_permisos: { permisos: { id: bigint; nombre: string } }[];
};

@Injectable()
export class UnidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
  ) {}

  async findAll(query: ListUnidadesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const where = {
      ...(query.vigente !== undefined && { vigente: query.vigente }),
      ...(query.search && {
        OR: [
          { codigo: { contains: query.search, mode: 'insensitive' as const } },
          {
            denominacion: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };

    const [total, unidades] = await this.prisma.$transaction([
      this.prisma.unidades.count({ where }),
      this.prisma.unidades.findMany({
        where,
        orderBy: { denominacion: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { unidades_roles: true } } },
      }),
    ]);

    // El conteo de usuarios se resuelve con `count` por unidad para no traer los usuarios.
    const items = await Promise.all(
      unidades.map(async (u) => ({
        id: u.id.toString(),
        codigo: u.codigo,
        denominacion: u.denominacion,
        vigente: u.vigente,
        cantidadRoles: u._count.unidades_roles,
        cantidadUsuarios: await this.sesiones.contarUsuariosDeUnidad(u.id),
        cantidadFuncionarios: await this.contarFuncionarios(u.id),
      })),
    );

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const unidad = await this.prisma.unidades.findUnique({
      where: { id: BigInt(id) },
      include: {
        unidades_roles: {
          include: {
            roles: { include: { roles_permisos: { include: { permisos: true } } } },
          },
        },
      },
    });

    if (!unidad) throw new NotFoundException('Unidad no encontrada');

    return {
      id: unidad.id.toString(),
      codigo: unidad.codigo,
      denominacion: unidad.denominacion,
      vigente: unidad.vigente,
      roles: unidad.unidades_roles.map((ur) => this.toRol(ur.roles)),
      cantidadUsuarios: await this.sesiones.contarUsuariosDeUnidad(unidad.id),
      cantidadFuncionarios: await this.contarFuncionarios(unidad.id),
    };
  }

  /** Funcionarios con relación laboral activa destinados en la unidad. */
  private contarFuncionarios(unidadId: bigint): Promise<number> {
    return this.prisma.relaciones_laborales.count({
      where: { unidad_id: unidadId, fecha_fin: null },
    });
  }

  async create(dto: CreateUnidadDto) {
    const codigo = dto.codigo.trim().toUpperCase();

    const existente = await this.prisma.unidades.findUnique({
      where: { codigo },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException('Ya existe una unidad con ese código');
    }

    const unidad = await this.prisma.unidades.create({
      data: {
        codigo,
        denominacion: dto.denominacion.trim(),
        vigente: dto.vigente ?? true,
      },
    });

    return this.findOne(unidad.id.toString());
  }

  async update(id: string, dto: UpdateUnidadDto) {
    const unidad = await this.prisma.unidades.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!unidad) throw new NotFoundException('Unidad no encontrada');

    // El código no se edita: es la referencia estable de la unidad y hay datos históricos
    // (relaciones laborales, cursos) que se leen por él en los scripts de la base.
    await this.prisma.unidades.update({
      where: { id: unidad.id },
      data: {
        denominacion: dto.denominacion?.trim(),
        vigente: dto.vigente,
      },
    });

    return this.findOne(id);
  }

  /**
   * Usuarios del sistema asignados a esta unidad.
   *
   * No confundir con el personal destinado acá: esto son cuentas de la aplicación
   * (`usuarios.unidad_id`), no legajos.
   */
  async findUsuarios(id: string) {
    const unidad = await this.prisma.unidades.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!unidad) throw new NotFoundException('Unidad no encontrada');

    const usuarios = await this.prisma.usuarios.findMany({
      where: { unidad_id: unidad.id, aplicacion: APLICACION },
      orderBy: { username: 'asc' },
      include: {
        usuarios_roles: { include: { roles: { select: { nombre: true } } } },
        personas: {
          select: { primer_nombre: true, primer_apellido: true },
        },
      },
    });

    return {
      items: usuarios.map((u) => ({
        id: u.id.toString(),
        username: u.username,
        nombre: u.personas
          ? `${u.personas.primer_nombre} ${u.personas.primer_apellido}`.trim()
          : null,
        estado: u.estado,
        rolesDirectos: u.usuarios_roles.map((ur) => ur.roles.nombre),
      })),
      total: usuarios.length,
    };
  }

  /**
   * Asigna usuarios del sistema a esta unidad.
   *
   * Cambia `usuarios.unidad_id`, con lo que pasan a heredar los roles de la unidad y a
   * ver su personal. Como eso altera permisos efectivos, se les cierra la sesión activa.
   * NO modifica el destino de ningún funcionario.
   */
  async asignarUsuarios(id: string, usuarioIds: string[]) {
    const unidad = await this.prisma.unidades.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, vigente: true },
    });
    if (!unidad) throw new NotFoundException('Unidad no encontrada');
    if (!unidad.vigente) {
      throw new ConflictException(
        'No se pueden asignar usuarios a una unidad que no está vigente',
      );
    }
    if (usuarioIds.length === 0) {
      throw new BadRequestException('No se indicó ningún usuario');
    }

    const ids = usuarioIds.map((u) => BigInt(u));
    const usuarios = await this.prisma.usuarios.findMany({
      where: { id: { in: ids }, aplicacion: APLICACION },
      select: { id: true, unidad_id: true },
    });

    const aMover = usuarios.filter((u) => u.unidad_id !== unidad.id);

    for (const usuario of aMover) {
      await this.prisma.usuarios.update({
        where: { id: usuario.id },
        data: { unidad_id: unidad.id },
      });
      await this.sesiones.invalidarUsuario(usuario.id);
    }

    return {
      asignados: aMover.length,
      yaEstaban: usuarios.length - aMover.length,
      noEncontrados: usuarioIds.length - usuarios.length,
    };
  }

  /** Saca al usuario de la unidad: queda sin unidad y opera solo con permisos globales. */
  async quitarUsuario(id: string, usuarioId: string) {
    const usuario = await this.prisma.usuarios.findFirst({
      where: {
        id: BigInt(usuarioId),
        unidad_id: BigInt(id),
        aplicacion: APLICACION,
      },
      select: { id: true },
    });
    if (!usuario) {
      throw new NotFoundException('El usuario no pertenece a esta unidad');
    }

    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: { unidad_id: null },
    });
    await this.sesiones.invalidarUsuario(usuario.id);

    return { ok: true };
  }

  async asignarRol(unidadId: string, rolId: string) {
    const unidad = await this.prisma.unidades.findUnique({
      where: { id: BigInt(unidadId) },
      select: { id: true },
    });
    if (!unidad) throw new NotFoundException('Unidad no encontrada');

    const rol = await this.prisma.roles.findFirst({
      where: { id: BigInt(rolId), aplicacion: APLICACION },
      select: { id: true },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');

    const existente = await this.prisma.unidades_roles.findUnique({
      where: { unidad_id_rol_id: { unidad_id: unidad.id, rol_id: rol.id } },
    });
    if (existente) {
      throw new ConflictException('El rol ya está asignado a esta unidad');
    }

    await this.prisma.unidades_roles.create({
      data: { unidad_id: unidad.id, rol_id: rol.id },
    });

    // Cambian los permisos efectivos de todos los usuarios de la unidad.
    await this.sesiones.invalidarPorUnidad(unidad.id);

    return this.findOne(unidadId);
  }

  async quitarRol(unidadId: string, rolId: string) {
    const unidad = await this.prisma.unidades.findUnique({
      where: { id: BigInt(unidadId) },
      select: { id: true },
    });
    if (!unidad) throw new NotFoundException('Unidad no encontrada');

    const asignacion = await this.prisma.unidades_roles.findUnique({
      where: {
        unidad_id_rol_id: { unidad_id: unidad.id, rol_id: BigInt(rolId) },
      },
    });
    if (!asignacion) {
      throw new NotFoundException('El rol no está asignado a esta unidad');
    }

    await this.prisma.unidades_roles.delete({
      where: {
        unidad_id_rol_id: { unidad_id: unidad.id, rol_id: BigInt(rolId) },
      },
    });

    await this.sesiones.invalidarPorUnidad(unidad.id);

    return this.findOne(unidadId);
  }

  private toRol(rol: RolConPermisos) {
    return {
      id: rol.id.toString(),
      nombre: rol.nombre,
      descripcion: rol.descripcion,
      permisos: rol.roles_permisos.map((rp) => ({
        id: rp.permisos.id.toString(),
        nombre: rp.permisos.nombre,
      })),
    };
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import { APLICACION } from '../../lib/aplicacion.const';
import { assertPermisosDelActor } from '../auth/privilegios';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

const ROLES_PROTEGIDOS = [
  'Administrador del sistema',
  'Oficina de Personal',
  'Usuario',
];

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
  ) {}

  async findAll() {
    const roles = await this.prisma.roles.findMany({
      where: { aplicacion: APLICACION },
      orderBy: { nombre: 'asc' },
      include: {
        roles_permisos: { include: { permisos: true } },
        _count: { select: { usuarios_roles: true } },
      },
    });

    return roles.map((r) => this.toResponse(r));
  }

  async findOne(id: string) {
    const rol = await this.prisma.roles.findFirst({
      where: { id: BigInt(id), aplicacion: APLICACION },
      include: {
        roles_permisos: { include: { permisos: true } },
        _count: { select: { usuarios_roles: true } },
      },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return {
      ...this.toResponse(rol),
      // Directos y vía unidad: son los que pierden la sesión si se tocan los permisos del rol.
      // Solo en el detalle, para no sumar un count por rol al listado.
      cantidadUsuariosAfectados: await this.sesiones.contarUsuariosDeRol(rol.id),
    };
  }

  async create(dto: CreateRolDto, actor: AuthenticatedUser) {
    const existente = await this.prisma.roles.findFirst({
      where: { nombre: dto.nombre, aplicacion: APLICACION },
    });
    if (existente) throw new ConflictException('Ya existe un rol con ese nombre');

    // Se valida todo antes de escribir y el alta va en una transacción, para no dejar el
    // rol creado a medias.
    const nombresPermisos = Array.from(new Set(dto.permisos ?? []));
    const permisos = nombresPermisos.length
      ? await this.prisma.permisos.findMany({
          where: { nombre: { in: nombresPermisos }, aplicacion: APLICACION },
        })
      : [];
    if (permisos.length !== nombresPermisos.length) {
      const faltan = nombresPermisos.filter((n) => !permisos.some((p) => p.nombre === n));
      throw new BadRequestException(`Permisos no encontrados: ${faltan.join(', ')}`);
    }
    assertPermisosDelActor(
      actor,
      permisos.map((p) => p.nombre),
      'crear un rol con esos permisos',
    );

    const rol = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.roles.create({
        data: { nombre: dto.nombre, descripcion: dto.descripcion, aplicacion: APLICACION },
      });
      if (permisos.length > 0) {
        await tx.roles_permisos.createMany({
          data: permisos.map((p) => ({ rol_id: creado.id, permiso_id: p.id })),
          skipDuplicates: true,
        });
      }
      return creado;
    });

    return this.findOne(rol.id.toString());
  }

  async update(id: string, dto: UpdateRolDto) {
    const rol = await this.prisma.roles.findFirst({
      where: { id: BigInt(id), aplicacion: APLICACION },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');

    if (dto.nombre && dto.nombre !== rol.nombre) {
      if (ROLES_PROTEGIDOS.includes(rol.nombre)) {
        throw new ForbiddenException('No se puede renombrar un rol base del sistema');
      }
      const existente = await this.prisma.roles.findFirst({
        where: { nombre: dto.nombre, aplicacion: APLICACION },
      });
      if (existente) throw new ConflictException('Ya existe un rol con ese nombre');
    }

    await this.prisma.roles.update({
      where: { id: rol.id },
      data: { nombre: dto.nombre, descripcion: dto.descripcion },
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const rol = await this.prisma.roles.findFirst({
      where: { id: BigInt(id), aplicacion: APLICACION },
      include: {
        _count: { select: { usuarios_roles: true, sub_unidades_roles: true } },
      },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    if (ROLES_PROTEGIDOS.includes(rol.nombre)) {
      throw new ForbiddenException('No se puede eliminar un rol base del sistema');
    }
    if (rol._count.usuarios_roles > 0) {
      throw new ConflictException('No se puede eliminar un rol con usuarios asignados');
    }
    if (rol._count.sub_unidades_roles > 0) {
      throw new ConflictException(
        'No se puede eliminar un rol asignado a una o más unidades',
      );
    }

    await this.prisma.roles_permisos.deleteMany({ where: { rol_id: rol.id } });
    await this.prisma.roles.delete({ where: { id: rol.id } });
    return { ok: true };
  }

  async activarPermiso(rolId: string, permisoId: string, actor: AuthenticatedUser) {
    const [rol, permiso] = await Promise.all([
      this.prisma.roles.findFirst({ where: { id: BigInt(rolId), aplicacion: APLICACION } }),
      this.prisma.permisos.findFirst({ where: { id: BigInt(permisoId), aplicacion: APLICACION } }),
    ]);
    if (!rol) throw new NotFoundException('Rol no encontrado');
    if (!permiso) throw new NotFoundException('Permiso no encontrado');

    assertPermisosDelActor(actor, [permiso.nombre], `activar el permiso ${permiso.nombre}`);

    await this.prisma.roles_permisos.upsert({
      where: { permiso_id_rol_id: { permiso_id: permiso.id, rol_id: rol.id } },
      create: { permiso_id: permiso.id, rol_id: rol.id },
      update: {},
    });

    // Afecta a quienes tienen el rol directo Y a quienes lo heredan por su unidad.
    await this.sesiones.invalidarPorRol(rol.id);

    return this.findOne(rolId);
  }

  async desactivarPermiso(rolId: string, permisoId: string) {
    const rol = await this.prisma.roles.findFirst({
      where: { id: BigInt(rolId), aplicacion: APLICACION },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');

    if (rol.nombre === 'Administrador del sistema') {
      throw new ForbiddenException(
        'No se pueden desactivar permisos del rol Administrador del sistema',
      );
    }

    await this.prisma.roles_permisos.deleteMany({
      where: { rol_id: rol.id, permiso_id: BigInt(permisoId) },
    });

    await this.sesiones.invalidarPorRol(rol.id);

    return this.findOne(rolId);
  }

  private toResponse(rol: {
    id: bigint;
    nombre: string;
    descripcion: string | null;
    roles_permisos: { permisos: { id: bigint; nombre: string } }[];
    _count: { usuarios_roles: number };
  }) {
    return {
      id: rol.id.toString(),
      nombre: rol.nombre,
      descripcion: rol.descripcion,
      protegido: ROLES_PROTEGIDOS.includes(rol.nombre),
      cantidadUsuarios: rol._count.usuarios_roles,
      permisos: rol.roles_permisos.map((rp) => ({
        id: rp.permisos.id.toString(),
        nombre: rp.permisos.nombre,
      })),
    };
  }
}

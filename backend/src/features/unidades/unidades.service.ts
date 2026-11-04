import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import { APLICACION } from '../../lib/aplicacion.const';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ListUnidadesQueryDto } from './dto/list-unidades-query.dto';
import { unidadesDeUsuario } from './unidades-usuario';

type RolConPermisos = {
  id: bigint;
  nombre: string;
  descripcion: string | null;
  roles_permisos: { permisos: { id: bigint; nombre: string } }[];
};

type UnidadDetalle = Awaited<ReturnType<UnidadesService['findOne']>>;

@Injectable()
export class UnidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly auditoria: AuditoriaService,
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

  /**
   * Usuarios del sistema asignados a esta unidad.
   *
   * No confundir con el personal destinado acá: esto son cuentas de la aplicación
   * vinculadas via `usuarios_unidades`, no legajos.
   */
  async findUsuarios(id: string) {
    const unidad = await this.prisma.unidades.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!unidad) throw new NotFoundException('Unidad no encontrada');

    const registros = await this.prisma.usuarios_unidades.findMany({
      where: { unidad_id: unidad.id, usuarios: { aplicacion: APLICACION } },
      include: {
        usuarios: {
          include: {
            usuarios_roles: { include: { roles: { select: { nombre: true } } } },
            personas: {
              select: { primer_nombre: true, primer_apellido: true },
            },
          },
        },
      },
      orderBy: { usuarios: { username: 'asc' } },
    });

    return {
      items: registros.map(({ usuarios: u }) => ({
        id: u.id.toString(),
        username: u.username,
        nombre: u.personas
          ? `${u.personas.primer_nombre} ${u.personas.primer_apellido}`.trim()
          : null,
        estado: u.estado,
        rolesDirectos: u.usuarios_roles.map((ur) => ur.roles.nombre),
      })),
      total: registros.length,
    };
  }

  /**
   * Asigna usuarios del sistema a esta unidad.
   *
   * Inserta filas en `usuarios_unidades`, con lo que pasan a heredar los roles de la unidad y a
   * ver su personal. Como eso altera permisos efectivos, se les cierra la sesión activa.
   * NO modifica el destino de ningún funcionario.
   */
  async asignarUsuarios(id: string, usuarioIds: string[], actorId: string) {
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
      select: { id: true, username: true },
    });

    // Verificar cuáles ya están en la unidad
    const yaAsignados = await this.prisma.usuarios_unidades.findMany({
      where: { unidad_id: unidad.id, usuario_id: { in: usuarios.map((u) => u.id) } },
      select: { usuario_id: true },
    });
    const yaAsignadosSet = new Set(yaAsignados.map((r) => r.usuario_id));
    const aMover = usuarios.filter((u) => !yaAsignadosSet.has(u.id));

    // Un registro por usuario, no uno por unidad: así la bitácora filtrada por el usuario
    // afectado muestra el cambio, con las unidades que tenía antes y las que le quedan.
    for (const usuario of aMover) {
      const anteriores = await unidadesDeUsuario(this.prisma, usuario.id);
      await this.prisma.usuarios_unidades.create({
        data: { usuario_id: usuario.id, unidad_id: unidad.id },
      });
      await this.sesiones.invalidarUsuario(usuario.id);
      void this.auditoria.registrar({
        usuarioId: actorId,
        accion: 'unidad.asignar',
        contexto: 'Usuarios',
        entidad: 'Usuario',
        entidadId: usuario.id,
        detalle: {
          usuario: usuario.username,
          unidadesAnteriores: anteriores,
          unidadesNuevas: await unidadesDeUsuario(this.prisma, usuario.id),
        },
      });
    }

    return {
      asignados: aMover.length,
      yaEstaban: usuarios.length - aMover.length,
      noEncontrados: usuarioIds.length - usuarios.length,
    };
  }

  /** Saca al usuario de la unidad: deja de heredar roles de esta unidad. */
  async quitarUsuario(id: string, usuarioId: string, actorId: string) {
    const registro = await this.prisma.usuarios_unidades.findFirst({
      where: {
        usuario_id: BigInt(usuarioId),
        unidad_id: BigInt(id),
        usuarios: { aplicacion: APLICACION },
      },
      include: { usuarios: { select: { username: true } } },
    });
    if (!registro) {
      throw new NotFoundException('El usuario no pertenece a esta unidad');
    }

    const anteriores = await unidadesDeUsuario(this.prisma, BigInt(usuarioId));

    await this.prisma.usuarios_unidades.delete({
      where: {
        usuario_id_unidad_id: {
          usuario_id: BigInt(usuarioId),
          unidad_id: BigInt(id),
        },
      },
    });
    await this.sesiones.invalidarUsuario(BigInt(usuarioId));

    void this.auditoria.registrar({
      usuarioId: actorId,
      accion: 'unidad.quitar',
      contexto: 'Usuarios',
      entidad: 'Usuario',
      entidadId: usuarioId,
      detalle: {
        usuario: registro.usuarios.username,
        unidadesAnteriores: anteriores,
        unidadesNuevas: anteriores.filter((u) => u.id !== id),
      },
    });

    return { ok: true };
  }

  async asignarRol(unidadId: string, rolId: string, actorId: string) {
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

    const antes = await this.findOne(unidadId);

    await this.prisma.unidades_roles.create({
      data: { unidad_id: unidad.id, rol_id: rol.id },
    });

    // Cambian los permisos efectivos de todos los usuarios de la unidad.
    await this.sesiones.invalidarPorUnidad(unidad.id);

    const despues = await this.findOne(unidadId);
    this.auditarCambioRoles('unidad_rol.agregar', actorId, rolId, antes, despues);
    return despues;
  }

  async quitarRol(unidadId: string, rolId: string, actorId: string) {
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

    const antes = await this.findOne(unidadId);

    await this.prisma.unidades_roles.delete({
      where: {
        unidad_id_rol_id: { unidad_id: unidad.id, rol_id: BigInt(rolId) },
      },
    });

    await this.sesiones.invalidarPorUnidad(unidad.id);

    const despues = await this.findOne(unidadId);
    this.auditarCambioRoles('unidad_rol.quitar', actorId, rolId, antes, despues);
    return despues;
  }

  /**
   * Un único registro a nivel unidad, aunque afecte a muchos usuarios. Guarda los roles
   * anteriores con sus permisos: si se quita el último, es lo único que permite reconstruir
   * qué permisos perdieron los usuarios de la unidad.
   */
  private auditarCambioRoles(
    accion: 'unidad_rol.agregar' | 'unidad_rol.quitar',
    actorId: string,
    rolId: string,
    antes: UnidadDetalle,
    despues: UnidadDetalle,
  ) {
    const rol =
      [...antes.roles, ...despues.roles].find((r) => r.id === rolId) ?? null;
    void this.auditoria.registrar({
      usuarioId: actorId,
      accion,
      contexto: 'Unidades',
      entidad: 'Unidad',
      entidadId: despues.id,
      detalle: {
        unidad: { codigo: despues.codigo, denominacion: despues.denominacion },
        rol,
        rolesAnteriores: antes.roles,
        rolesResultantes: despues.roles.map((r) => r.nombre),
        usuariosAfectados: despues.cantidadUsuarios,
      },
    });
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

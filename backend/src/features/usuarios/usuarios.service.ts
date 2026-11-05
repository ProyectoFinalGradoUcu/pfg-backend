import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { unidadesDeUsuario } from '../unidades/unidades-usuario';
import { APLICACION } from '../../lib/aplicacion.const';
import { assertPermisosDelActor, assertPuedeGestionarA, ROL_ADMIN } from '../auth/privilegios';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ListUsuariosQueryDto } from './dto/list-usuarios-query.dto';

const DEFAULT_BCRYPT_ROUNDS = 12;

const USUARIO_INCLUDE = {
  usuarios_roles: { include: { roles: true } },
  usuarios_unidades: {
    include: { unidades: { select: { id: true, codigo: true, denominacion: true } } },
  },
  personas: {
    select: {
      id: true,
      cedula: true,
      primer_nombre: true,
      primer_apellido: true,
      email: true,
      relaciones_laborales: {
        where: { fecha_fin: null },
        orderBy: { fecha_inicio: 'desc' as const },
        take: 1,
        select: {
          id: true,
          fecha_inicio: true,
          tipo_funcionario: true,
          unidades: { select: { id: true, codigo: true, denominacion: true } },
          grados: { select: { id: true, codigo: true, denominacion: true } },
          escalafones: { select: { id: true, codigo: true, denominacion: true } },
          situaciones: { select: { id: true, codigo: true, denominacion: true } },
        },
      },
    },
  },
} as const;

/**
 * Include ampliado para `findOne`: trae además los roles de la unidad con sus permisos,
 * necesario para computar `permisosEfectivos` (desglose de origen).
 */
const USUARIO_INCLUDE_DETAIL = {
  usuarios_roles: {
    include: {
      roles: { include: { roles_permisos: { include: { permisos: true } } } },
    },
  },
  usuarios_unidades: {
    include: {
      unidades: {
        select: {
          id: true,
          codigo: true,
          denominacion: true,
          unidades_roles: {
            include: {
              roles: { include: { roles_permisos: { include: { permisos: true } } } },
            },
          },
        },
      },
    },
  },
  personas: {
    select: {
      id: true,
      cedula: true,
      primer_nombre: true,
      primer_apellido: true,
      email: true,
      relaciones_laborales: {
        where: { fecha_fin: null },
        orderBy: { fecha_inicio: 'desc' as const },
        take: 1,
        select: {
          id: true,
          fecha_inicio: true,
          tipo_funcionario: true,
          unidades: { select: { id: true, codigo: true, denominacion: true } },
          grados: { select: { id: true, codigo: true, denominacion: true } },
          escalafones: { select: { id: true, codigo: true, denominacion: true } },
          situaciones: { select: { id: true, codigo: true, denominacion: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sesiones: SesionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(query: ListUsuariosQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);
    const palabras = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const coincide = (texto: string) => ({
      contains: texto,
      mode: Prisma.QueryMode.insensitive,
    });

    const where: Prisma.usuariosWhereInput = {
      aplicacion: APLICACION,
      // Palabra por palabra: nombre y apellido van en columnas separadas, y así
      // "Victoria Castro" encuentra a la persona aunque ninguna columna tenga el texto entero.
      ...(palabras.length
        ? {
            AND: palabras.map((palabra) => ({
              OR: [
                { username: coincide(palabra) },
                { personas: { primer_nombre: coincide(palabra) } },
                { personas: { primer_apellido: coincide(palabra) } },
              ],
            })),
          }
        : {}),
      ...(query.rolId ? { usuarios_roles: { some: { rol_id: BigInt(query.rolId) } } } : {}),
      ...(query.estado ? { estado: query.estado } : {}),
    };

    const [total, usuarios] = await this.prisma.$transaction([
      this.prisma.usuarios.count({ where }),
      this.prisma.usuarios.findMany({
        where,
        orderBy: { username: 'asc' },
        include: USUARIO_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: usuarios.map((u) => this.toResponse(u)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const usuario = await this.prisma.usuarios.findFirst({
      where: { id: BigInt(id), aplicacion: APLICACION },
      include: USUARIO_INCLUDE_DETAIL,
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return this.toDetailResponse(usuario);
  }

  async create(dto: CreateUsuarioDto, actor: AuthenticatedUser) {
    const existente = await this.prisma.usuarios.findFirst({
      where: { username: dto.username, aplicacion: APLICACION },
    });
    if (existente) throw new ConflictException('Ya existe un usuario con ese username');

    if (dto.personaId) {
      const persona = await this.prisma.personas.findUnique({
        where: { id: BigInt(dto.personaId) },
      });
      if (!persona) throw new BadRequestException('La persona indicada no existe');
    }

    // Se valida todo antes de escribir y el alta va en una transacción, para no dejar el
    // usuario creado a medias.
    const nombresRoles = Array.from(new Set(dto.roles ?? []));
    const roles = nombresRoles.length
      ? await this.prisma.roles.findMany({
          where: { nombre: { in: nombresRoles }, aplicacion: APLICACION },
          include: { roles_permisos: { include: { permisos: { select: { nombre: true } } } } },
        })
      : [];
    if (roles.length !== nombresRoles.length) {
      const faltan = nombresRoles.filter((n) => !roles.some((r) => r.nombre === n));
      throw new BadRequestException(`Roles no encontrados: ${faltan.join(', ')}`);
    }
    assertPermisosDelActor(
      actor,
      roles.flatMap((r) => r.roles_permisos.map((rp) => rp.permisos.nombre)),
      'crear un usuario con esos roles',
    );

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const usuario = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.usuarios.create({
        data: {
          username: dto.username,
          password_hash: passwordHash,
          estado: 'activo',
          aplicacion: APLICACION,
          persona_id: dto.personaId ? BigInt(dto.personaId) : null,
        },
      });
      if (roles.length > 0) {
        await tx.usuarios_roles.createMany({
          data: roles.map((r) => ({ usuario_id: creado.id, rol_id: r.id })),
          skipDuplicates: true,
        });
      }
      return creado;
    });

    return this.findOne(usuario.id.toString());
  }

  async update(id: string, dto: UpdateUsuarioDto, actor: AuthenticatedUser) {
    const usuario = await this.prisma.usuarios.findFirst({
      where: { id: BigInt(id), aplicacion: APLICACION },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    if (dto.estado === 'bloqueado' && id === actor.id) {
      throw new ForbiddenException('No podés bloquear tu propio usuario');
    }
    if (id !== actor.id) {
      await this.assertPuedeGestionar(actor, usuario.id, 'modificar a este usuario');
    }

    if (dto.personaId !== undefined && dto.personaId !== null) {
      const persona = await this.prisma.personas.findUnique({
        where: { id: BigInt(dto.personaId) },
      });
      if (!persona) throw new BadRequestException('La persona indicada no existe');
    }

    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: {
        estado: dto.estado,
        persona_id:
          dto.personaId === undefined
            ? undefined
            : dto.personaId === null
              ? null
              : BigInt(dto.personaId),
        bloqueado_hasta: dto.estado === 'activo' ? null : undefined,
        intentos_fallidos: dto.estado === 'activo' ? 0 : undefined,
      },
    });

    return this.findOne(id);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    if (id === actor.id) {
      throw new ForbiddenException('No podés eliminar tu propio usuario');
    }
    const usuario = await this.prisma.usuarios.findFirst({
      where: { id: BigInt(id), aplicacion: APLICACION },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    await this.assertPuedeGestionar(actor, usuario.id, 'eliminar a este usuario');

    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: { estado: 'bloqueado', bloqueado_hasta: null, intentos_fallidos: 0 },
    });
    return { ok: true };
  }

  async asignarRol(usuarioId: string, rolId: string, actor: AuthenticatedUser) {
    const [usuario, rol] = await Promise.all([
      this.prisma.usuarios.findFirst({ where: { id: BigInt(usuarioId), aplicacion: APLICACION } }),
      this.prisma.roles.findFirst({
        where: { id: BigInt(rolId), aplicacion: APLICACION },
        include: { roles_permisos: { include: { permisos: { select: { nombre: true } } } } },
      }),
    ]);
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    if (!rol) throw new NotFoundException('Rol no encontrado');

    assertPermisosDelActor(
      actor,
      rol.roles_permisos.map((rp) => rp.permisos.nombre),
      `asignar el rol ${rol.nombre}`,
    );

    await this.prisma.usuarios_roles.upsert({
      where: { usuario_id_rol_id: { usuario_id: usuario.id, rol_id: rol.id } },
      create: { usuario_id: usuario.id, rol_id: rol.id },
      update: {},
    });

    await this.sesiones.invalidarUsuario(usuario.id);

    return this.findOne(usuarioId);
  }

  async quitarRol(usuarioId: string, rolId: string, actor: AuthenticatedUser) {
    const [usuario, rol] = await Promise.all([
      this.prisma.usuarios.findFirst({ where: { id: BigInt(usuarioId), aplicacion: APLICACION } }),
      this.prisma.roles.findFirst({ where: { id: BigInt(rolId), aplicacion: APLICACION } }),
    ]);
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    if (!rol) throw new NotFoundException('Rol no encontrado');

    if (usuarioId === actor.id && rol.nombre === ROL_ADMIN) {
      throw new ForbiddenException(
        'No podés quitarte tu propio rol Administrador del sistema',
      );
    }
    if (usuarioId !== actor.id) {
      await this.assertPuedeGestionar(actor, usuario.id, `quitarle el rol ${rol.nombre}`);
    }

    await this.prisma.usuarios_roles.deleteMany({
      where: { usuario_id: usuario.id, rol_id: rol.id },
    });

    await this.sesiones.invalidarUsuario(usuario.id);

    return this.findOne(usuarioId);
  }

  /**
   * Asigna (o quita, con `null`) la unidad del usuario del sistema.
   *
   * Es la unidad de la CUENTA, no la del funcionario: define qué personal ve este usuario y
   * de qué unidad hereda roles. Cambiarla modifica sus permisos efectivos, así que hay que
   * cerrarle la sesión activa.
   *
   * Acepta un array de unidadIds. Si es vacío, quita todas las unidades.
   */
  async asignarUnidades(id: string, unidadIds: string[], actor: AuthenticatedUser) {
    const actorId = actor.id;
    const usuario = await this.prisma.usuarios.findFirst({
      where: { id: BigInt(id), aplicacion: APLICACION },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    // Validar que las unidades existan y estén vigentes
    if (unidadIds.length > 0) {
      const unidades = await this.prisma.unidades.findMany({
        where: { id: { in: unidadIds.map((u) => BigInt(u)) } },
        select: { id: true, vigente: true },
      });
      if (unidades.length !== unidadIds.length) {
        throw new NotFoundException('Una o más unidades no encontradas');
      }
      const noVigentes = unidades.filter((u) => !u.vigente);
      if (noVigentes.length > 0) {
        throw new ConflictException('Una o más unidades no están vigentes');
      }
    }

    const anteriores = await unidadesDeUsuario(this.prisma, usuario.id);

    // Las unidades heredan roles: sumar una unidad nueva también otorga permisos.
    // Solo cuentan las que se agregan; las que el usuario ya tenía no las está otorgando el actor.
    const agregadas = unidadIds.filter((u) => !anteriores.some((a) => a.id === u));
    if (agregadas.length > 0) {
      const permisosHeredados = await this.prisma.permisos.findMany({
        where: {
          roles_permisos: {
            some: {
              roles: {
                unidades_roles: { some: { unidad_id: { in: agregadas.map((u) => BigInt(u)) } } },
              },
            },
          },
        },
        select: { nombre: true },
      });
      assertPermisosDelActor(
        actor,
        permisosHeredados.map((p) => p.nombre),
        'asignar esa unidad',
      );
    }

    // Reemplazar todas las asignaciones: borrar las existentes e insertar las nuevas
    await this.prisma.usuarios_unidades.deleteMany({
      where: { usuario_id: usuario.id },
    });

    if (unidadIds.length > 0) {
      await this.prisma.usuarios_unidades.createMany({
        data: unidadIds.map((uid) => ({
          usuario_id: usuario.id,
          unidad_id: BigInt(uid),
        })),
      });
    }

    await this.sesiones.invalidarUsuario(usuario.id);

    // Reemplaza todas de una vez: si solo se sacaron unidades es una quita; si entró alguna
    // nueva (aunque a la vez salga otra), una asignación.
    const nuevas = await unidadesDeUsuario(this.prisma, usuario.id);
    const soloQuito = nuevas.every((n) => anteriores.some((a) => a.id === n.id));
    void this.auditoria.registrar({
      usuarioId: actorId,
      accion: soloQuito ? 'unidad.quitar' : 'unidad.asignar',
      contexto: 'Usuarios',
      entidad: 'Usuario',
      entidadId: usuario.id,
      detalle: {
        usuario: usuario.username,
        unidadesAnteriores: anteriores,
        unidadesNuevas: nuevas,
      },
    });

    return this.findOne(id);
  }

  async resetPassword(id: string, dto: ResetPasswordDto, actor: AuthenticatedUser) {
    const usuario = await this.prisma.usuarios.findFirst({
      where: { id: BigInt(id), aplicacion: APLICACION },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    // Resetear la contraseña de alguien con más permisos permitiría entrar con su cuenta.
    await this.assertPuedeGestionar(actor, usuario.id, 'resetear la contraseña de este usuario');

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: {
        password_hash: passwordHash,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        // El reset que hace un administrador corta las sesiones abiertas del usuario.
        sesiones_invalidas_desde: new Date(),
      },
    });

    return { ok: true };
  }

  /**
   * Roles y permisos efectivos (directos y heredados de sus unidades) de un usuario, para
   * no dejar que alguien con menos privilegios lo gestione (ver `assertPuedeGestionarA`).
   */
  private async assertPuedeGestionar(
    actor: AuthenticatedUser,
    usuarioId: bigint,
    accion: string,
  ): Promise<void> {
    if (actor.roles.includes(ROL_ADMIN)) return;
    const rolConPermisos = {
      select: {
        nombre: true,
        roles_permisos: { select: { permisos: { select: { nombre: true } } } },
      },
    } as const;
    const destino = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: {
        usuarios_roles: { select: { roles: rolConPermisos } },
        usuarios_unidades: {
          select: { unidades: { select: { unidades_roles: { select: { roles: rolConPermisos } } } } },
        },
      },
    });
    const roles = [
      ...(destino?.usuarios_roles ?? []).map((ur) => ur.roles),
      ...(destino?.usuarios_unidades ?? []).flatMap((uu) =>
        uu.unidades.unidades_roles.map((ur) => ur.roles),
      ),
    ];
    assertPuedeGestionarA(
      actor,
      {
        roles: roles.map((r) => r.nombre),
        permisos: roles.flatMap((r) => r.roles_permisos.map((rp) => rp.permisos.nombre)),
      },
      accion,
    );
  }

  private toResponse(usuario: {
    id: bigint;
    username: string;
    estado: string;
    persona_id: bigint | null;
    bloqueado_hasta: Date | null;
    usuarios_unidades: { unidades: { id: bigint; codigo: string; denominacion: string } }[];
    usuarios_roles: { roles: { id: bigint; nombre: string } }[];
    personas:
      | {
          id: bigint;
          cedula: string;
          primer_nombre: string;
          primer_apellido: string;
          email: string | null;
          relaciones_laborales: {
            id: bigint;
            fecha_inicio: Date;
            tipo_funcionario: string | null;
            unidades: { id: bigint; codigo: string; denominacion: string } | null;
            grados: { id: bigint; codigo: string; denominacion: string } | null;
            escalafones: { id: bigint; codigo: string; denominacion: string } | null;
            situaciones: { id: bigint; codigo: string; denominacion: string } | null;
          }[];
        }
      | null;
  }) {
    const relacion = usuario.personas?.relaciones_laborales[0] ?? null;
    return {
      id: usuario.id.toString(),
      username: usuario.username,
      estado: usuario.estado,
      bloqueadoHasta: usuario.bloqueado_hasta,
      unidades: usuario.usuarios_unidades.map((uu) => ({
        id: uu.unidades.id.toString(),
        codigo: uu.unidades.codigo,
        denominacion: uu.unidades.denominacion,
      })),
      persona: usuario.personas
        ? {
            id: usuario.personas.id.toString(),
            cedula: usuario.personas.cedula,
            nombre: `${usuario.personas.primer_nombre} ${usuario.personas.primer_apellido}`.trim(),
            email: usuario.personas.email,
            relacionLaboral: relacion
              ? {
                  id: relacion.id.toString(),
                  fechaInicio: relacion.fecha_inicio,
                  tipoFuncionario: relacion.tipo_funcionario,
                  unidad: relacion.unidades
                    ? {
                        id: relacion.unidades.id.toString(),
                        codigo: relacion.unidades.codigo,
                        denominacion: relacion.unidades.denominacion,
                      }
                    : null,
                  grado: relacion.grados
                    ? {
                        id: relacion.grados.id.toString(),
                        codigo: relacion.grados.codigo,
                        denominacion: relacion.grados.denominacion,
                      }
                    : null,
                  escalafon: relacion.escalafones
                    ? {
                        id: relacion.escalafones.id.toString(),
                        codigo: relacion.escalafones.codigo,
                        denominacion: relacion.escalafones.denominacion,
                      }
                    : null,
                  situacion: relacion.situaciones
                    ? {
                        id: relacion.situaciones.id.toString(),
                        codigo: relacion.situaciones.codigo,
                        denominacion: relacion.situaciones.denominacion,
                      }
                    : null,
                }
              : null,
          }
        : null,
      roles: usuario.usuarios_roles.map((ur) => ({
        id: ur.roles.id.toString(),
        nombre: ur.roles.nombre,
      })),
    };
  }

  /**
   * Respuesta ampliada para `findOne`: incluye `permisosEfectivos` con desglose de origen.
   */
  private toDetailResponse(usuario: {
    id: bigint;
    username: string;
    estado: string;
    persona_id: bigint | null;
    bloqueado_hasta: Date | null;
    usuarios_unidades: {
      unidades: {
        id: bigint;
        codigo: string;
        denominacion: string;
        unidades_roles: {
          roles: {
            id: bigint;
            nombre: string;
            roles_permisos: { permisos: { id: bigint; nombre: string } }[];
          };
        }[];
      };
    }[];
    usuarios_roles: {
      roles: {
        id: bigint;
        nombre: string;
        roles_permisos: { permisos: { id: bigint; nombre: string } }[];
      };
    }[];
    personas: {
      id: bigint;
      cedula: string;
      primer_nombre: string;
      primer_apellido: string;
      email: string | null;
      relaciones_laborales: {
        id: bigint;
        fecha_inicio: Date;
        tipo_funcionario: string | null;
        unidades: { id: bigint; codigo: string; denominacion: string } | null;
        grados: { id: bigint; codigo: string; denominacion: string } | null;
        escalafones: { id: bigint; codigo: string; denominacion: string } | null;
        situaciones: { id: bigint; codigo: string; denominacion: string } | null;
      }[];
    } | null;
  }) {
    const relacion = usuario.personas?.relaciones_laborales[0] ?? null;

    // — Computar permisos efectivos con desglose de origen —
    const permisosMap = new Map<string, {
      nombre: string;
      alcance: 'global' | 'unidad';
      origen: 'directo' | 'unidad';
      rol: string;
      unidad?: string;
    }>();

    // Permisos de roles directos
    for (const ur of usuario.usuarios_roles) {
      for (const rp of ur.roles.roles_permisos) {
        const nombre = rp.permisos.nombre;
        permisosMap.set(nombre, {
          nombre,
          alcance: nombre.endsWith('.unidad') ? 'unidad' : 'global',
          origen: 'directo',
          rol: ur.roles.nombre,
        });
      }
    }

    // Permisos de roles heredados de las unidades
    for (const uu of usuario.usuarios_unidades) {
      for (const ur of uu.unidades.unidades_roles) {
        for (const rp of ur.roles.roles_permisos) {
          const nombre = rp.permisos.nombre;
          if (!permisosMap.has(nombre)) {
            permisosMap.set(nombre, {
              nombre,
              alcance: nombre.endsWith('.unidad') ? 'unidad' : 'global',
              origen: 'unidad',
              rol: ur.roles.nombre,
              unidad: uu.unidades.denominacion,
            });
          }
        }
      }
    }

    const permisosEfectivos = Array.from(permisosMap.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    );

    return {
      id: usuario.id.toString(),
      username: usuario.username,
      estado: usuario.estado,
      bloqueadoHasta: usuario.bloqueado_hasta,
      unidades: usuario.usuarios_unidades.map((uu) => ({
        id: uu.unidades.id.toString(),
        codigo: uu.unidades.codigo,
        denominacion: uu.unidades.denominacion,
      })),
      persona: usuario.personas
        ? {
            id: usuario.personas.id.toString(),
            cedula: usuario.personas.cedula,
            nombre: `${usuario.personas.primer_nombre} ${usuario.personas.primer_apellido}`.trim(),
            email: usuario.personas.email,
            relacionLaboral: relacion
              ? {
                  id: relacion.id.toString(),
                  fechaInicio: relacion.fecha_inicio,
                  tipoFuncionario: relacion.tipo_funcionario,
                  unidad: relacion.unidades
                    ? {
                        id: relacion.unidades.id.toString(),
                        codigo: relacion.unidades.codigo,
                        denominacion: relacion.unidades.denominacion,
                      }
                    : null,
                  grado: relacion.grados
                    ? {
                        id: relacion.grados.id.toString(),
                        codigo: relacion.grados.codigo,
                        denominacion: relacion.grados.denominacion,
                      }
                    : null,
                  escalafon: relacion.escalafones
                    ? {
                        id: relacion.escalafones.id.toString(),
                        codigo: relacion.escalafones.codigo,
                        denominacion: relacion.escalafones.denominacion,
                      }
                    : null,
                  situacion: relacion.situaciones
                    ? {
                        id: relacion.situaciones.id.toString(),
                        codigo: relacion.situaciones.codigo,
                        denominacion: relacion.situaciones.denominacion,
                      }
                    : null,
                }
              : null,
          }
        : null,
      roles: usuario.usuarios_roles.map((ur) => ({
        id: ur.roles.id.toString(),
        nombre: ur.roles.nombre,
      })),
      permisosEfectivos,
    };
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../lib/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ListUsuariosQueryDto } from './dto/list-usuarios-query.dto';

const DEFAULT_BCRYPT_ROUNDS = 12;
const ROL_ADMIN = 'Administrador del sistema';

const USUARIO_INCLUDE = {
  usuarios_roles: { include: { roles: true } },
  personas: {
    select: {
      id: true,
      cedula: true,
      primer_nombre: true,
      primer_apellido: true,
      email: true,
      relaciones_laborales: {
        where: { estado: 'activo', fecha_fin: null },
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
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListUsuariosQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);

    const [total, usuarios] = await this.prisma.$transaction([
      this.prisma.usuarios.count(),
      this.prisma.usuarios.findMany({
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
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: BigInt(id) },
      include: USUARIO_INCLUDE,
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return this.toResponse(usuario);
  }

  async create(dto: CreateUsuarioDto) {
    const existente = await this.prisma.usuarios.findUnique({
      where: { username: dto.username },
    });
    if (existente) throw new ConflictException('Ya existe un usuario con ese username');

    if (dto.personaId) {
      const persona = await this.prisma.personas.findUnique({
        where: { id: BigInt(dto.personaId) },
      });
      if (!persona) throw new BadRequestException('La persona indicada no existe');
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const usuario = await this.prisma.usuarios.create({
      data: {
        username: dto.username,
        password_hash: passwordHash,
        estado: 'activo',
        persona_id: dto.personaId ? BigInt(dto.personaId) : null,
      },
    });

    if (dto.roles && dto.roles.length > 0) {
      const roles = await this.prisma.roles.findMany({
        where: { nombre: { in: dto.roles } },
      });
      if (roles.length !== dto.roles.length) {
        throw new BadRequestException('Uno o más roles no existen');
      }
      await this.prisma.usuarios_roles.createMany({
        data: roles.map((r) => ({ usuario_id: usuario.id, rol_id: r.id })),
        skipDuplicates: true,
      });
    }

    return this.findOne(usuario.id.toString());
  }

  async update(id: string, dto: UpdateUsuarioDto, currentUserId: string) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: BigInt(id) },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    if (dto.estado === 'bloqueado' && id === currentUserId) {
      throw new ForbiddenException('No podés bloquear tu propio usuario');
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

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new ForbiddenException('No podés eliminar tu propio usuario');
    }
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: BigInt(id) },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: { estado: 'bloqueado', bloqueado_hasta: null, intentos_fallidos: 0 },
    });
    return { ok: true };
  }

  async asignarRol(usuarioId: string, rolId: string) {
    const [usuario, rol] = await Promise.all([
      this.prisma.usuarios.findUnique({ where: { id: BigInt(usuarioId) } }),
      this.prisma.roles.findUnique({ where: { id: BigInt(rolId) } }),
    ]);
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    if (!rol) throw new NotFoundException('Rol no encontrado');

    await this.prisma.usuarios_roles.upsert({
      where: { usuario_id_rol_id: { usuario_id: usuario.id, rol_id: rol.id } },
      create: { usuario_id: usuario.id, rol_id: rol.id },
      update: {},
    });

    return this.findOne(usuarioId);
  }

  async quitarRol(usuarioId: string, rolId: string, currentUserId: string) {
    const [usuario, rol] = await Promise.all([
      this.prisma.usuarios.findUnique({ where: { id: BigInt(usuarioId) } }),
      this.prisma.roles.findUnique({ where: { id: BigInt(rolId) } }),
    ]);
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    if (!rol) throw new NotFoundException('Rol no encontrado');

    if (usuarioId === currentUserId && rol.nombre === ROL_ADMIN) {
      throw new ForbiddenException(
        'No podés quitarte tu propio rol Administrador del sistema',
      );
    }

    await this.prisma.usuarios_roles.deleteMany({
      where: { usuario_id: usuario.id, rol_id: rol.id },
    });

    return this.findOne(usuarioId);
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: BigInt(id) },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: {
        password_hash: passwordHash,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      },
    });

    return { ok: true };
  }

  private toResponse(usuario: {
    id: bigint;
    username: string;
    estado: string;
    persona_id: bigint | null;
    bloqueado_hasta: Date | null;
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
}

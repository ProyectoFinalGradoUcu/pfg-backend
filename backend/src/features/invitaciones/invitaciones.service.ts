import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../lib/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { APLICACION } from '../../lib/aplicacion.const';
import { CrearInvitacionDto } from './dto/crear-invitacion.dto';
import { AceptarInvitacionDto } from './dto/aceptar-invitacion.dto';
import { ListInvitacionesQueryDto } from './dto/list-invitaciones-query.dto';

const DEFAULT_INVITATION_TTL_HOURS = 48;
const DEFAULT_BCRYPT_ROUNDS = 12;

const INVITACION_SELECT = {
  id: true,
  email: true,
  estado: true,
  roles: true,
  persona_id: true,
  creado_en: true,
  expira_en: true,
  usado_en: true,
} as const;

function toInvitacionResponse(inv: {
  id: bigint;
  email: string;
  estado: string;
  roles: string[];
  persona_id: bigint | null;
  creado_en: Date;
  expira_en: Date;
  usado_en: Date | null;
}) {
  return {
    id: inv.id.toString(),
    email: inv.email,
    estado: inv.estado,
    roles: inv.roles,
    personaId: inv.persona_id?.toString() ?? null,
    creadoEn: inv.creado_en,
    expiraEn: inv.expira_en,
    usadoEn: inv.usado_en,
  };
}

@Injectable()
export class InvitacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(dto: CrearInvitacionDto, adminId: string) {
    if (dto.personaId) {
      const persona = await this.prisma.personas.findUnique({
        where: { id: BigInt(dto.personaId) },
        select: { id: true },
      });
      if (!persona) {
        throw new BadRequestException(`Persona con id ${dto.personaId} no encontrada`);
      }
    }

    if (dto.roles?.length) {
      const rolesEncontrados = await this.prisma.roles.findMany({
        where: { nombre: { in: dto.roles } },
        select: { nombre: true },
      });
      const rolesNoExisten = dto.roles.filter(
        (r) => !rolesEncontrados.some((re) => re.nombre === r),
      );
      if (rolesNoExisten.length) {
        throw new BadRequestException(`Roles no encontrados: ${rolesNoExisten.join(', ')}`);
      }
    }

    const usuarioExistente = await this.prisma.usuarios.findFirst({
      where: { username: dto.email },
      select: { id: true },
    });
    if (usuarioExistente) {
      throw new ConflictException('Ya existe un usuario registrado con ese email');
    }

    const pendienteExistente = await this.prisma.invitaciones.findFirst({
      where: {
        email: dto.email,
        estado: 'pendiente',
        expira_en: { gt: new Date() },
      },
    });
    if (pendienteExistente) {
      throw new ConflictException('Ya existe una invitación pendiente para ese email');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const ttlHoras = Number(process.env.INVITATION_TTL_HOURS ?? DEFAULT_INVITATION_TTL_HOURS);
    const expiraEn = new Date(Date.now() + ttlHoras * 60 * 60 * 1000);

    const invitacion = await this.prisma.invitaciones.create({
      data: {
        email: dto.email,
        token_hash: tokenHash,
        persona_id: dto.personaId ? BigInt(dto.personaId) : null,
        roles: dto.roles ?? [],
        estado: 'pendiente',
        creado_por: BigInt(adminId),
        expira_en: expiraEn,
      },
    });

    await this.mailer.sendInvitacion(dto.email, rawToken);

    return {
      id: invitacion.id.toString(),
      email: invitacion.email,
      estado: invitacion.estado,
      roles: invitacion.roles,
      expiraEn: invitacion.expira_en,
      creadoEn: invitacion.creado_en,
    };
  }

  /**
   * Con `page` o `pageSize` devuelve una página. Sin ellos, el listado completo: lo usa el alta
   * de usuarios para avisar de una invitación pendiente sin distinguir mayúsculas.
   */
  async listar(query: ListInvitacionesQueryDto = {}) {
    const where = query.estado ? { estado: query.estado } : undefined;
    // El id desempata: con fechas iguales un registro podría repetirse o saltearse entre páginas.
    const orderBy = [{ creado_en: 'desc' as const }, { id: 'desc' as const }];

    if (query.page === undefined && query.pageSize === undefined) {
      const invitaciones = await this.prisma.invitaciones.findMany({
        where,
        orderBy,
        select: INVITACION_SELECT,
      });
      return invitaciones.map(toInvitacionResponse);
    }

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);
    const [total, invitaciones] = await this.prisma.$transaction([
      this.prisma.invitaciones.count({ where }),
      this.prisma.invitaciones.findMany({
        where,
        orderBy,
        select: INVITACION_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: invitaciones.map(toInvitacionResponse), total, page, pageSize };
  }

  async verificarToken(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const invitacion = await this.prisma.invitaciones.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!invitacion) {
      throw new BadRequestException('Token inválido');
    }
    if (invitacion.estado !== 'pendiente') {
      throw new BadRequestException('Invitación ya utilizada o revocada');
    }
    if (invitacion.expira_en <= new Date()) {
      await this.prisma.invitaciones.update({
        where: { id: invitacion.id },
        data: { estado: 'expirada' },
      });
      throw new BadRequestException('Invitación expirada');
    }

    return { valida: true, email: invitacion.email };
  }

  async aceptar(dto: AceptarInvitacionDto) {
    const tokenHash = hashToken(dto.token);
    const invitacion = await this.prisma.invitaciones.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!invitacion) {
      throw new BadRequestException('Token inválido');
    }
    if (invitacion.estado !== 'pendiente') {
      throw new BadRequestException('Invitación ya utilizada o revocada');
    }
    if (invitacion.expira_en <= new Date()) {
      await this.prisma.invitaciones.update({
        where: { id: invitacion.id },
        data: { estado: 'expirada' },
      });
      throw new BadRequestException('Invitación expirada');
    }

    const usuarioExistente = await this.prisma.usuarios.findFirst({
      where: { username: invitacion.email },
    });
    if (usuarioExistente) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(dto.password, rounds);
    const ahora = new Date();

    const usuarioCreado = await this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuarios.create({
        data: {
          username: invitacion.email,
          password_hash: passwordHash,
          persona_id: invitacion.persona_id ?? null,
          estado: 'activo',
          intentos_fallidos: 0,
          aplicacion: APLICACION,
        },
      });

      if (invitacion.roles.length > 0) {
        const roles = await tx.roles.findMany({
          where: { nombre: { in: invitacion.roles }, aplicacion: APLICACION },
          select: { id: true },
        });
        await tx.usuarios_roles.createMany({
          data: roles.map((r) => ({
            usuario_id: usuario.id,
            rol_id: r.id,
          })),
        });
      }

      await tx.invitaciones.update({
        where: { id: invitacion.id },
        data: { estado: 'aceptada', usado_en: ahora },
      });

      return usuario;
    });

    // Sin usuario autenticado (endpoint público): se registra manualmente con
    // el propio usuario recién creado como actor, igual que LOGIN en AuthService.
    void this.auditoria.registrar({
      usuarioId: usuarioCreado.id,
      accion: 'CREAR',
      contexto: 'Usuarios',
      entidad: 'Usuario',
      entidadId: usuarioCreado.id,
      detalle: { email: invitacion.email, viaInvitacion: true, invitacionId: invitacion.id },
    });

    return { ok: true };
  }

  async revocar(id: string) {
    const invitacion = await this.prisma.invitaciones.findUnique({
      where: { id: BigInt(id) },
    });
    if (!invitacion) {
      throw new NotFoundException('Invitación no encontrada');
    }
    if (invitacion.estado !== 'pendiente') {
      throw new BadRequestException('Solo se pueden revocar invitaciones pendientes');
    }

    await this.prisma.invitaciones.update({
      where: { id: invitacion.id },
      data: { estado: 'expirada' },
    });

    return { ok: true };
  }
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

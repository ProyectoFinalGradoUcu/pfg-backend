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
import { CrearInvitacionDto } from './dto/crear-invitacion.dto';
import { AceptarInvitacionDto } from './dto/aceptar-invitacion.dto';

const DEFAULT_INVITATION_TTL_HOURS = 48;
const DEFAULT_BCRYPT_ROUNDS = 12;

@Injectable()
export class InvitacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
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

    const usuarioExistente = await this.prisma.usuarios.findUnique({
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

  async listar(estado?: string) {
    const invitaciones = await this.prisma.invitaciones.findMany({
      where: estado ? { estado } : undefined,
      orderBy: { creado_en: 'desc' },
      select: {
        id: true,
        email: true,
        estado: true,
        roles: true,
        persona_id: true,
        creado_en: true,
        expira_en: true,
        usado_en: true,
      },
    });

    return invitaciones.map((inv) => ({
      id: inv.id.toString(),
      email: inv.email,
      estado: inv.estado,
      roles: inv.roles,
      personaId: inv.persona_id?.toString() ?? null,
      creadoEn: inv.creado_en,
      expiraEn: inv.expira_en,
      usadoEn: inv.usado_en,
    }));
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

    const usuarioExistente = await this.prisma.usuarios.findUnique({
      where: { username: invitacion.email },
    });
    if (usuarioExistente) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(dto.password, rounds);
    const ahora = new Date();

    await this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuarios.create({
        data: {
          username: invitacion.email,
          password_hash: passwordHash,
          persona_id: invitacion.persona_id ?? null,
          estado: 'activo',
          intentos_fallidos: 0,
        },
      });

      if (invitacion.roles.length > 0) {
        const roles = await tx.roles.findMany({
          where: { nombre: { in: invitacion.roles } },
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

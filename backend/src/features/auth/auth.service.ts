import * as crypto from 'crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../lib/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { SignInDto } from './dto/sign-in.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordTokenDto } from './dto/reset-password-token.dto';
import {
  AuthPayload,
  AuthenticatedUser,
  SignInResult,
} from './types/auth.types';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_MINUTES = 15;
const DEFAULT_EXPIRES_IN = '4h';
const DEFAULT_BCRYPT_ROUNDS = 12;

const DEFAULT_RESET_TTL_HOURS = 1;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async signIn(dto: SignInDto): Promise<SignInResult> {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { username: dto.username },
      include: {
        usuarios_roles: {
          include: {
            roles: {
              include: {
                roles_permisos: { include: { permisos: true } },
              },
            },
          },
        },
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (usuario.estado !== 'activo') {
      throw new UnauthorizedException('Usuario bloqueado');
    }

    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
      throw new UnauthorizedException('Usuario bloqueado temporalmente');
    }

    const passwordOk = await bcrypt.compare(dto.password, usuario.password_hash);

    if (!passwordOk) {
      await this.registrarIntentoFallido(usuario.id, usuario.intentos_fallidos);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (usuario.intentos_fallidos > 0 || usuario.bloqueado_hasta) {
      await this.prisma.usuarios.update({
        where: { id: usuario.id },
        data: { intentos_fallidos: 0, bloqueado_hasta: null },
      });
    }

    const roles = usuario.usuarios_roles.map((ur) => ur.roles.nombre);
    const permisos = Array.from(
      new Set(
        usuario.usuarios_roles.flatMap((ur) =>
          ur.roles.roles_permisos.map((rp) => rp.permisos.nombre),
        ),
      ),
    );

    const payload: AuthPayload = {
      sub: usuario.id.toString(),
      username: usuario.username,
      roles,
      permisos,
    };

    const expiresIn = process.env.JWT_EXPIRES_IN ?? DEFAULT_EXPIRES_IN;
    const token = jwt.sign(payload, this.getSecret(), { expiresIn } as jwt.SignOptions);
    const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
    const ttl = decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 0;

    const user: AuthenticatedUser = {
      id: payload.sub,
      username: payload.username,
      roles,
      permisos,
    };

    return { token, expiresIn: ttl, user };
  }

  async changePassword(usuarioId: string, dto: ChangePasswordDto) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: BigInt(usuarioId) },
    });
    if (!usuario) throw new UnauthorizedException('Usuario no encontrado');

    const ok = await bcrypt.compare(dto.passwordActual, usuario.password_hash);
    if (!ok) throw new UnauthorizedException('La contraseña actual es incorrecta');

    if (dto.passwordActual === dto.passwordNueva) {
      throw new BadRequestException('La nueva contraseña debe ser distinta a la actual');
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(dto.passwordNueva, rounds);

    await this.prisma.usuarios.update({
      where: { id: usuario.id },
      data: { password_hash: passwordHash },
    });

    return { ok: true };
  }

  verifyToken(token: string): AuthPayload {
    try {
      return jwt.verify(token, this.getSecret()) as AuthPayload;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  async assertUsuarioActivo(id: string): Promise<void> {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: BigInt(id) },
      select: { estado: true, bloqueado_hasta: true },
    });

    if (!usuario || usuario.estado !== 'activo') {
      throw new UnauthorizedException('Usuario inactivo');
    }

    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
      throw new UnauthorizedException('Usuario bloqueado temporalmente');
    }
  }

  async solicitarResetPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { username: dto.username },
      select: { id: true, username: true, estado: true, bloqueado_hasta: true },
    });

    // Respuesta siempre igual para evitar enumeración de usuarios
    if (!usuario || usuario.estado !== 'activo') {
      return { ok: true };
    }
    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
      return { ok: true };
    }

    // Invalida tokens anteriores no utilizados
    await this.prisma.tokens_reset_password.updateMany({
      where: { usuario_id: usuario.id, usado: false },
      data: { usado: true },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const ttlHoras = Number(process.env.RESET_PASSWORD_TTL_HOURS ?? DEFAULT_RESET_TTL_HOURS);

    await this.prisma.tokens_reset_password.create({
      data: {
        usuario_id: usuario.id,
        token_hash: tokenHash,
        expira_en: new Date(Date.now() + ttlHoras * 60 * 60 * 1000),
      },
    });

    await this.mailer.sendResetPassword(usuario.username, rawToken);

    return { ok: true };
  }

  async resetPasswordConToken(dto: ResetPasswordTokenDto): Promise<{ ok: true }> {
    const tokenHash = hashToken(dto.token);
    const record = await this.prisma.tokens_reset_password.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!record) {
      throw new BadRequestException('Token inválido');
    }
    if (record.usado) {
      throw new BadRequestException('Token ya utilizado');
    }
    if (record.expira_en <= new Date()) {
      throw new BadRequestException('Token expirado');
    }

    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: record.usuario_id },
      select: { id: true, estado: true },
    });

    if (!usuario || usuario.estado !== 'activo') {
      throw new BadRequestException('Usuario inactivo o no encontrado');
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(dto.passwordNueva, rounds);

    await this.prisma.$transaction([
      this.prisma.usuarios.update({
        where: { id: usuario.id },
        data: {
          password_hash: passwordHash,
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        },
      }),
      this.prisma.tokens_reset_password.update({
        where: { id: record.id },
        data: { usado: true, usado_en: new Date() },
      }),
    ]);

    return { ok: true };
  }

  private async registrarIntentoFallido(
    usuarioId: bigint,
    intentosActuales: number,
  ): Promise<void> {
    const max = Number(process.env.MAX_LOGIN_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS);
    const lockMinutes = Number(
      process.env.LOCK_DURATION_MIN ?? DEFAULT_LOCK_MINUTES,
    );

    const nuevosIntentos = intentosActuales + 1;

    if (nuevosIntentos >= max) {
      const hasta = new Date(Date.now() + lockMinutes * 60_000);
      await this.prisma.usuarios.update({
        where: { id: usuarioId },
        data: { intentos_fallidos: 0, bloqueado_hasta: hasta },
      });
    } else {
      await this.prisma.usuarios.update({
        where: { id: usuarioId },
        data: { intentos_fallidos: nuevosIntentos },
      });
    }
  }

  private getSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'JWT_SECRET no configurado o demasiado corto',
      );
    }
    return secret;
  }
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

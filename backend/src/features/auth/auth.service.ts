import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../lib/prisma.service';
import { APLICACION } from '../../lib/aplicacion.const';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { SignInDto } from './dto/sign-in.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  AuthPayload,
  AuthenticatedUser,
  SignInResult,
} from './types/auth.types';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_MINUTES = 15;
const DEFAULT_EXPIRES_IN = '4h';
const DEFAULT_BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async signIn(dto: SignInDto): Promise<SignInResult> {
    const usuario = await this.prisma.usuarios.findFirst({
      where: { username: dto.username, aplicacion: APLICACION },
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
      void this.auditoria.registrar({
        usuarioId: usuario.id,
        accion: 'LOGIN_FALLIDO',
        contexto: 'Autenticación',
        entidad: 'Usuario',
        entidadId: usuario.id,
        detalle: { username: dto.username, motivo: 'contraseña incorrecta' },
      });
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

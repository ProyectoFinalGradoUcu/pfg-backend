import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordTokenDto } from './dto/reset-password-token.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser, SignInResponse } from './types/auth.types';
import { AuditoriaService } from '../auditoria/auditoria.service';

const COOKIE_NAME = 'auth_token';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditoria: AuditoriaService,
  ) {}

  @Post('sign-in')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar sesión con usuario y contraseña' })
  @ApiResponse({ status: 200, description: 'Login exitoso. Setea cookie auth_token y retorna el usuario' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas o usuario bloqueado' })
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignInResponse> {
    const result = await this.authService.signIn(dto);
    res.cookie(COOKIE_NAME, result.token, this.cookieOptions(result.expiresIn));
    return { user: result.user };
  }

  // Es público para poder borrar la cookie aunque el token ya no sea válido.
  // Si el token es válido, además se invalidan sus sesiones.
  @Post('sign-out')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('auth_token')
  @ApiOperation({ summary: 'Cerrar sesión (invalida el token actual y los demás del usuario)' })
  async signOut(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      let usuarioId: string | null = null;
      try {
        usuarioId = this.authService.verifyToken(token).sub;
      } catch {
        // Token vencido o adulterado: no hay sesión que cerrar, solo se borra la cookie.
      }
      if (usuarioId) await this.authService.cerrarSesiones(usuarioId);
    }
    res.clearCookie(COOKIE_NAME, this.cookieOptions(0));
    return { ok: true };
  }

  @Get('me')
  @ApiCookieAuth('auth_token')
  @ApiOperation({ summary: 'Obtener datos del usuario autenticado' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('auth_token')
  @ApiOperation({ summary: 'Cambiar la contraseña del usuario autenticado' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(user.id, dto);
    // El cambio invalida todas las sesiones, incluida esta: se le emite un token nuevo
    // a quien hizo el cambio.
    const sesion = await this.authService.reemitirSesion(user.id);
    res.cookie(COOKIE_NAME, sesion.token, this.cookieOptions(sesion.expiresIn));
    void this.auditoria.registrar({
      usuarioId: user.id,
      accion: 'CAMBIAR_PASSWORD',
      contexto: 'Autenticación',
      entidad: 'Usuario',
      entidadId: user.id,
      host: this.getHost(req),
    });
    return result;
  }

  private getHost(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Solicitar reset de contraseña por email' })
  @ApiResponse({ status: 200, description: 'Solicitud procesada (respuesta siempre igual)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.solicitarResetPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Establecer nueva contraseña con token de reset' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Token inválido, expirado o ya utilizado' })
  resetPassword(@Body() dto: ResetPasswordTokenDto) {
    return this.authService.resetPasswordConToken(dto);
  }

  private cookieOptions(maxAgeSeconds: number) {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict' as const,
      path: '/',
      maxAge: maxAgeSeconds > 0 ? maxAgeSeconds * 1000 : 0,
    };
  }
}

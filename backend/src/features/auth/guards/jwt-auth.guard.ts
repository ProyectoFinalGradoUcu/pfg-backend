import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser, AuthPayload } from '../types/auth.types';

const COOKIE_NAME = 'auth_token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { cookies?: Record<string, string>; user?: AuthenticatedUser }>();
    const token = request.cookies?.[COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('No autenticado');
    }

    const payload: AuthPayload = this.authService.verifyToken(token);
    await this.authService.assertUsuarioActivo(payload.sub, payload.iat);

    request.user = {
      id: payload.sub,
      username: payload.username,
      roles: payload.roles ?? [],
      permisos: payload.permisos ?? [],
      unidades: payload.unidades ?? [],
    };

    return true;
  }
}

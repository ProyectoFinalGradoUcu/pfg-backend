import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthenticatedUser } from '../../features/auth/types/auth.types';
import { ALCANCE_KEY } from './alcance.decorator';
import { AlcanceResuelto, permisoDeUnidad } from './alcance.types';

/**
 * Resuelve el alcance de datos de los endpoints marcados con `@RequireAlcance`.
 *
 * Reglas (spec 002 §3):
 * - Global gana: si el usuario tiene el permiso base y también el `.unidad`, se resuelve global.
 * - Alcance de unidad sin unidad = sin acceso: nunca se degrada a global.
 */
@Injectable()
export class AlcanceGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permisoBase = this.reflector.getAllAndOverride<string>(ALCANCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permisoBase) return true;

    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: AuthenticatedUser; alcance?: AlcanceResuelto }
      >();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    if (user.permisos.includes(permisoBase)) {
      request.alcance = { tipo: 'global' };
      return true;
    }

    if (user.permisos.includes(permisoDeUnidad(permisoBase))) {
      if (!user.unidades || user.unidades.length === 0) {
        throw new ForbiddenException(
          'El usuario tiene alcance de unidad pero no tiene unidades asignadas. ' +
            'Verificá que tenga al menos una unidad asociada.',
        );
      }
      request.alcance = {
        tipo: 'unidad',
        unidadIds: user.unidades.map((u) => u.id),
      };
      return true;
    }

    throw new ForbiddenException('Permiso insuficiente');
  }
}

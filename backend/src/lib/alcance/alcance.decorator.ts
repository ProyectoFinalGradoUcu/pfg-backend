import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { AlcanceResuelto } from './alcance.types';

export const ALCANCE_KEY = 'alcance';

/**
 * Protege un endpoint segmentable por unidad.
 *
 * A diferencia de `@RequirePermissions` (que exige TODOS los permisos listados), este decorador
 * autoriza si el usuario tiene el permiso base **o** su variante `.unidad`, y deja el alcance
 * resuelto en el request para que el service lo traduzca a filtros.
 *
 * ```ts
 * @Get()
 * @RequireAlcance('personas.ver')   // acepta personas.ver o personas.ver.unidad
 * findAll(@Alcance() alcance: AlcanceResuelto) { ... }
 * ```
 */
export const RequireAlcance = (permisoBase: string) =>
  SetMetadata(ALCANCE_KEY, permisoBase);

/** Inyecta el `AlcanceResuelto` que dejó `AlcanceGuard` en el request. */
export const Alcance = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AlcanceResuelto | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { alcance?: AlcanceResuelto }>();
    return request.alcance;
  },
);

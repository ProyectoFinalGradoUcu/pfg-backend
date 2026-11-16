import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Metadata que deja @Throttle({ default: ... }).
const METADATA_LIMITE_DEFAULT = 'THROTTLER:LIMIT' + 'default';

// Rate limit solo en los endpoints con @Throttle (login, contraseñas, invitaciones).
// No es global porque en una unidad todos salen a internet con la misma IP.
@Injectable()
export class ThrottleSoloMarcadosGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const marcado = this.reflector.getAllAndOverride<number | undefined>(METADATA_LIMITE_DEFAULT, [
      context.getHandler(),
      context.getClass(),
    ]);
    return marcado === undefined;
  }

  // Por IP + usuario, para no bloquear a toda una unidad que sale con la misma IP.
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const usuario = req.body?.username;
    return typeof usuario === 'string' && usuario.trim()
      ? `${req.ip}:${usuario.trim().toLowerCase()}`
      : req.ip;
  }
}

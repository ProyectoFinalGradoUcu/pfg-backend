import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './types/auth.types';

export const ROL_ADMIN = 'Administrador del sistema';

type Actor = Pick<AuthenticatedUser, 'roles' | 'permisos'>;

export function esAdministrador(actor: Actor): boolean {
  return actor.roles.includes(ROL_ADMIN);
}

/**
 * Evita la escalada de privilegios: quien gestiona usuarios o roles solo puede
 * repartir permisos que él mismo tiene. El Administrador del sistema queda exento: es el que
 * reparte todo, incluso permisos nuevos que todavía no estén en su rol.
 *
 * Los permisos del actor se toman del JWT. Es seguro porque cualquier cambio de sus permisos
 * efectivos invalida el token (`SesionesService`), así que no pueden estar desactualizados.
 */
/**
 * Solo se puede gestionar (resetear la contraseña, bloquear, quitar roles) a un usuario cuyos
 * permisos efectivos, directos y por unidad, estén incluidos en los propios. El Administrador
 * del sistema puede gestionar a cualquiera; los demás no pueden gestionar a un Administrador.
 */
export function assertPuedeGestionarA(
  actor: Actor,
  destino: { roles: string[]; permisos: string[] },
  accion: string,
): void {
  if (esAdministrador(actor)) return;
  if (destino.roles.includes(ROL_ADMIN)) {
    throw new ForbiddenException(`No podés ${accion}: es un ${ROL_ADMIN}`);
  }
  const propios = new Set(actor.permisos);
  const ajenos = Array.from(new Set(destino.permisos.filter((p) => !propios.has(p)))).sort();
  if (ajenos.length > 0) {
    const MOSTRAR = 5;
    const lista =
      ajenos.length > MOSTRAR
        ? `${ajenos.slice(0, MOSTRAR).join(', ')} y ${ajenos.length - MOSTRAR} más`
        : ajenos.join(', ');
    throw new ForbiddenException(
      `No podés ${accion}: tiene permisos que vos no tenés (${lista})`,
    );
  }
}

export function assertPermisosDelActor(
  actor: Actor,
  permisosOtorgados: string[],
  accion: string,
): void {
  if (esAdministrador(actor)) return;
  const propios = new Set(actor.permisos);
  const ajenos = Array.from(new Set(permisosOtorgados.filter((p) => !propios.has(p)))).sort();
  if (ajenos.length > 0) {
    const MOSTRAR = 5;
    const lista =
      ajenos.length > MOSTRAR
        ? `${ajenos.slice(0, MOSTRAR).join(', ')} y ${ajenos.length - MOSTRAR} más`
        : ajenos.join(', ');
    throw new ForbiddenException(
      `No podés ${accion}: otorga permisos que vos no tenés (${lista})`,
    );
  }
}

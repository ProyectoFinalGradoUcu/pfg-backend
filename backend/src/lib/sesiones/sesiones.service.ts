import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Invalidación de sesiones activas ante cambios de permisos efectivos o de alcance.
 *
 * Los permisos viajan firmados dentro del JWT, así que revocarlos no tiene efecto hasta que el
 * token deja de ser válido. Marcar `usuarios.sesiones_invalidas_desde` fuerza el re-login: el
 * `JwtAuthGuard` compara ese timestamp contra el `iat` del token en cada request.
 *
 * Solo hace falta invalidar cuando cambia algo que está FIRMADO en el token: los permisos
 * efectivos o la unidad del usuario. Mover un funcionario de destino no requiere invalidar
 * nada, porque el filtrado de datos se resuelve por consulta en cada request.
 */
@Injectable()
export class SesionesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Un usuario puntual: cambio de roles directos o de su unidad. */
  async invalidarUsuario(usuarioId: bigint): Promise<void> {
    await this.prisma.usuarios.updateMany({
      where: { id: usuarioId },
      data: { sesiones_invalidas_desde: new Date() },
    });
  }

  /** Todos los usuarios del sistema asignados a esa unidad. */
  async invalidarPorUnidad(unidadId: bigint): Promise<void> {
    await this.prisma.usuarios.updateMany({
      where: { usuarios_unidades: { some: { unidad_id: unidadId } } },
      data: { sesiones_invalidas_desde: new Date() },
    });
  }

  /**
   * Todos los usuarios que tienen el rol, por asignación directa O por alguna de sus unidades.
   * Omitir la segunda rama deja sesiones con permisos viejos sin ninguna señal visible.
   */
  async invalidarPorRol(rolId: bigint): Promise<void> {
    await this.prisma.usuarios.updateMany({
      where: {
        OR: [
          { usuarios_roles: { some: { rol_id: rolId } } },
          {
            usuarios_unidades: {
              some: {
                unidades: { unidades_roles: { some: { rol_id: rolId } } },
              },
            },
          },
        ],
      },
      data: { sesiones_invalidas_desde: new Date() },
    });
  }

  /** Cuántos usuarios quedarían deslogueados al tocar los roles de una unidad. */
  async contarUsuariosDeUnidad(unidadId: bigint): Promise<number> {
    return this.prisma.usuarios.count({
      where: { usuarios_unidades: { some: { unidad_id: unidadId } } },
    });
  }
}

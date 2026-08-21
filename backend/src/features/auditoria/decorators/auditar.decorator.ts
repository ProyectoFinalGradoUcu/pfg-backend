import { SetMetadata } from '@nestjs/common';

export const AUDITAR_KEY = 'auditar';

export interface AuditarOptions {
  /** Nombre del contexto/módulo. Debe existir en la tabla `contextos` (ej. 'Roles'). */
  contexto: string;
  /**
   * Nombre de la acción. Debe existir en la tabla `acciones`. Si se omite, el
   * interceptor la infiere del método HTTP (POST→CREAR, etc.).
   */
  accion?: string;
  /** Nombre de la entidad afectada (ej. 'Rol'). Opcional. */
  entidad?: string;
  /**
   * Guarda también la respuesta del handler bajo `detalle.resultado`. Sirve para
   * altas, donde el body por sí solo deja el evento ilegible: son todos ids de
   * catálogo y la respuesta ya trae los datos.
   */
  incluirRespuesta?: boolean;
}

/**
 * Marca un controller (o un handler puntual) para que sus operaciones mutantes
 * queden registradas automáticamente en la bitácora de auditoría.
 *
 * Uso típico a nivel de clase:
 *   @Auditar({ contexto: 'Roles', entidad: 'Rol' })
 *   @Controller('roles')
 */
export const Auditar = (options: AuditarOptions) =>
  SetMetadata(AUDITAR_KEY, options);

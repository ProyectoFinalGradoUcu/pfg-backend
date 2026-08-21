import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export const RequirePermissions = (...permisos: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permisos);

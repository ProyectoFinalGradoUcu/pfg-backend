export interface UnidadInfo {
  id: string;
  denominacion: string;
}

export interface AuthPayload {
  sub: string;
  username: string;
  roles: string[];
  permisos: string[];
  /** Unidades asignadas al usuario. Array vacío si no tiene ninguna. */
  unidades: UnidadInfo[];
  /** Emitido en segundos (lo agrega jsonwebtoken). Se compara con `sesiones_invalidas_desde`. */
  iat?: number;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  roles: string[];
  permisos: string[];
  unidades: UnidadInfo[];
}

export interface SignInResult {
  token: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export interface SignInResponse {
  user: AuthenticatedUser;
}

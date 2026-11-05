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
  /** Emitido en segundos (lo agrega jsonwebtoken). Respaldo para tokens sin `iatMs`. */
  iat?: number;
  /** Emitido en milisegundos. Se compara con `sesiones_invalidas_desde`. */
  iatMs?: number;
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

export interface AuthPayload {
  sub: string;
  username: string;
  roles: string[];
  permisos: string[];
  /** Unidad derivada de la relación laboral activa. `null` si no tiene. Ver spec 002 §3. */
  unidadId: string | null;
  unidadDenominacion: string | null;
  /** Emitido en segundos (lo agrega jsonwebtoken). Se compara con `sesiones_invalidas_desde`. */
  iat?: number;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  roles: string[];
  permisos: string[];
  unidadId: string | null;
  unidadDenominacion: string | null;
}

export interface SignInResult {
  token: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export interface SignInResponse {
  user: AuthenticatedUser;
}

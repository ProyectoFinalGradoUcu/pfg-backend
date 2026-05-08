export interface AuthPayload {
  sub: string;
  username: string;
  roles: string[];
  permisos: string[];
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  roles: string[];
  permisos: string[];
}

export interface SignInResult {
  token: string;
  expiresIn: number;
  user: AuthenticatedUser;
}

export interface SignInResponse {
  user: AuthenticatedUser;
}

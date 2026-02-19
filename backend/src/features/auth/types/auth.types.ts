export interface AuthPayload {
  sub: number;
  email: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn?: number;
}

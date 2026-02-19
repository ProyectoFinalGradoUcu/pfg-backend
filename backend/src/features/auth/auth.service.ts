import { Injectable } from '@nestjs/common';
import { SignInDto } from './dto/sign-in.dto';
import * as jwt from 'jsonwebtoken';
import { AuthPayload, TokenResponse } from './types/auth.types';

@Injectable()
export class AuthService {
  async signIn(dto: SignInDto): Promise<TokenResponse | { error: string }> {
    // Este ejemplo lo hice para probar de que al levantar el entorno me responde el backend.
    // Cuando tengamos definida la BD real cambiaremos la lógica.
    if (dto.email === 'test@example.com' && dto.password === 'password') {
      const user = { id: 1, email: dto.email };
      const secret = process.env.JWT_SECRET ?? 'dev-secret';
      const token = jwt.sign({ sub: user.id, email: user.email } as AuthPayload, secret, {
        expiresIn: '1h',
      });
      return { accessToken: token, expiresIn: 3600 };
    }

    return { error: 'Invalid credentials' };
  }
}

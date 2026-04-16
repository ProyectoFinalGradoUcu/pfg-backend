import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Iniciar sesión', description: 'Autentica al usuario y retorna un token JWT.' })
  @ApiResponse({ status: 201, description: 'Login exitoso. Retorna el token JWT.' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  @Post('sign-in')
  async signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }
}

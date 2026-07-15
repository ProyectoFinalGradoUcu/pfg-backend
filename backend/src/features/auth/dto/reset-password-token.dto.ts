import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordTokenDto {
  @ApiProperty({ description: 'Token recibido por email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'MiNuevaClaveSegura1!' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  passwordNueva: string;
}

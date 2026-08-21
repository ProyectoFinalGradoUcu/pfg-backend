import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AceptarInvitacionDto {
  @ApiProperty({ description: 'Token recibido por email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'MiClaveSegura1!' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;
}

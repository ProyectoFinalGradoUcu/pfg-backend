import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'ClaveAnterior2025*' })
  @IsString()
  @MinLength(6)
  @MaxLength(255)
  passwordActual: string;

  @ApiProperty({ example: 'ClaveNueva2026*' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  passwordNueva: string;
}

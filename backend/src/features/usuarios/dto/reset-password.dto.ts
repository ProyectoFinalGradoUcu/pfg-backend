import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'ClaveProvisoria2025*' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;
}

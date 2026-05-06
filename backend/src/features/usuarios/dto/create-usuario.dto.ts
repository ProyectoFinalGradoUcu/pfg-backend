import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUsuarioDto {
  @ApiProperty({ example: 'silva.g@fau.mil.uy' })
  @IsEmail()
  @MaxLength(60)
  username: string;

  @ApiProperty({ example: 'ClaveInicial2025*' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;

  @ApiPropertyOptional({ example: '1542' })
  @IsOptional()
  @IsString()
  personaId?: string;

  @ApiPropertyOptional({ type: [String], example: ['Oficina de Personal'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

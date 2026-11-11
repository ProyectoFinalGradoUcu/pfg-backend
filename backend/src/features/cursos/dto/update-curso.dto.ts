import { IsBoolean, IsOptional, IsString, IsNotEmpty, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCursoDto {
  @ApiPropertyOptional({ example: 'Curso Básico de Aviación', maxLength: 200 })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  nombre_curso?: string;

  @ApiPropertyOptional({ example: 'Escuela Militar de Aeronáutica', maxLength: 200 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  institucion?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  es_obligatorio?: boolean;
}

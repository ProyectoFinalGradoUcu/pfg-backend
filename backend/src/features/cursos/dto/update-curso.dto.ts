import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCursoDto {
  @ApiPropertyOptional({ example: 'Curso Básico de Aviación', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre_curso?: string;

  @ApiPropertyOptional({ example: 'Escuela Militar de Aeronáutica', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  institucion?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  es_obligatorio?: boolean;
}

import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class UpdateCursoDto {
  @ApiPropertyOptional({ example: 'Curso Básico de Aviación', maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del curso no puede quedar vacío' })
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

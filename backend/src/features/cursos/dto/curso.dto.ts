import {
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FuncionarioCursoDto } from '../../funcionaro/dto/funcionario-curso.dto';
import { ModuloCursoDto } from './modulo-curso.dto';

export class CursoDto {

  @ApiProperty({ example: 'Curso de Aviacion ', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  nombre_curso: string;

  @ApiProperty({ example: 'Institucion Aviacion', maxLength: 100 })
  @IsString()
  @MaxLength(200)
  institucion: string;

  @ApiPropertyOptional({ example: 'B001', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: 'NRO123412351', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: true, description: 'Indica si el curso es obligatorio (true) u optativo (false)' })
  @IsOptional()
  @IsBoolean()
  es_obligatorio?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  funcionarios_cursos?: FuncionarioCursoDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsArray()
  modulos_curso?: ModuloCursoDto[];


  
}

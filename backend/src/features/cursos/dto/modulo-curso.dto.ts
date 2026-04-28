import {
  IsString,
  IsOptional,
  MaxLength,
  IsInt,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CursoDto } from './curso.dto';
import { FuncionarioModuloCursoDto } from '../../funcionaro/dto/funcionario-modulo-curso.dt';

export class ModuloCursoDto {
  @ApiProperty({ example: '12345678', maxLength: 12 })
  @IsString()
  @MaxLength(12)
  id: string;

  @ApiProperty({ example: '001' })
  @IsString()
  @MaxLength(200)
  curso_id?: string;

  @ApiProperty({ example: 'Modulo Curso 001', maxLength: 100 })
  @IsString()
  @MaxLength(200)
  nombre_modulo: string;

  @ApiProperty({ example: '1', maxLength: 100 })
  @IsOptional()
  @IsInt()
  orden_modulo?: number;

  @ApiPropertyOptional({ example: 'Curso de aviacion donde aprendes a volar', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  descripcion?: string;

  @IsOptional()
  @IsArray()
  funcionarios_modulos_curso?: FuncionarioModuloCursoDto[];

  @IsOptional()
  curso?: CursoDto;
}

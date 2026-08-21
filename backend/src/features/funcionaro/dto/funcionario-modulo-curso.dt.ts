import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ModuloCursoDto } from '../../cursos/dto/modulo-curso.dto';

export class FuncionarioModuloCursoDto {
  funcionario_curso_id: string;
  modulo_curso_id: string;

  @IsOptional()
  @IsString()
  numero_orden?: string;

  @IsOptional()
  @IsString()
  boletin?: string;

  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @IsOptional()
  @IsString()
  calificacion?: string;

//   @IsOptional()
//   persona?: PersonaDto;

  @IsOptional()
  modulo_curso?: ModuloCursoDto;
}

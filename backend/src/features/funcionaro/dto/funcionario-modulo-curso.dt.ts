import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ModuloCursoDto } from '../../cursos/dto/modulo-curso.dto';

export class FuncionarioModuloCursoDto {
  persona_id: string;        
  modulo_curso_id: string;   

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

import {
  IsString,
  IsOptional,
  MaxLength,
  IsDate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CursoDto } from '../../cursos/dto/curso.dto';

export class FuncionarioCursoDto {


  persona_id: string;
  curso_id: string;


  @ApiProperty({ example: '2023-01-01', maxLength: 100 })
  @IsDate()
  fecha_inicio: string;

  @ApiPropertyOptional({ example: '2023-12-31', maxLength: 100 })
  @IsOptional()
  @IsDate()
  fecha_fin?: string;

  @ApiPropertyOptional({ example: '100', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  calificacion?: string;

  @IsOptional()
  curso?: CursoDto;

//   @IsOptional()
//   persona?: PersonaDto;
 
}

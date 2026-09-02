import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  aprobado?: boolean;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  calificacion?: number;

  @ApiPropertyOptional({ example: 'No alcanzó el mínimo de asistencia', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;

  @ApiPropertyOptional({ example: 'ORD-1542', maxLength: 50, description: 'Orden que designa el curso (nivel inscripción)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, description: 'Boletín de la orden (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @IsOptional()
  curso?: CursoDto;

//   @IsOptional()
//   persona?: PersonaDto;
 
}

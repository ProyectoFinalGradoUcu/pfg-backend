import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONDICIONES_APLICACION,
  MODOS_REQUISITO,
  TIPOS_REQUISITO,
} from '../ascensos.constants.js';

/** Un `CURSO_APROBADO` se cumple con `aprobado = true` y sin nota mínima. */
export class ReglaRequisitoDto {
  @ApiProperty({ enum: TIPOS_REQUISITO, example: 'CURSO_APROBADO' })
  @IsIn([...TIPOS_REQUISITO])
  tipo: string;

  @ApiProperty({ example: 'Curso de pasaje de grado (M-02)', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  descripcion: string;

  @ApiPropertyOptional({
    enum: MODOS_REQUISITO,
    default: 'TODOS',
    description: 'Si hay varios cursos vinculados: TODOS los exige, ALGUNO alcanza con uno.',
  })
  @IsOptional()
  @IsIn([...MODOS_REQUISITO])
  modo?: string;

  @ApiPropertyOptional({
    enum: CONDICIONES_APLICACION,
    isArray: true,
    default: ['SIEMPRE'],
    description: 'Con que se cumpla una de estas condiciones, el requisito aplica a la persona.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn([...CONDICIONES_APLICACION], { each: true })
  aplica_si?: string[];

  @ApiPropertyOptional({
    example: 15,
    description: 'Años de antigüedad requeridos. Obligatorio si tipo = ANTIGUEDAD_SERVICIO.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  anios_antiguedad?: number;

  @ApiPropertyOptional({ example: 1, description: 'Orden de presentación dentro de la regla' })
  @IsOptional()
  @IsInt()
  @Min(1)
  orden?: number;

  @ApiPropertyOptional({
    type: [Number],
    example: [12, 15],
    description: 'Cursos del catálogo que satisfacen el requisito.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  cursos_ids?: number[];
}

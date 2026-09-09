import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReglaRequisitoDto } from './regla-requisito.dto.js';

/**
 * Editar no sobreescribe: cierra la versión vigente y crea una nueva. Lo que no
 * venga acá se copia de la anterior.
 */
export class UpdateReglaDto {
  @ApiPropertyOptional({ example: 'Cbo. 2.ª → Cbo. 1.ª', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  grado_destino_id?: number;

  @ApiPropertyOptional({ example: 730, description: 'Tiempo mínimo en el grado, en días' })
  @IsOptional()
  @IsInt()
  @Min(1)
  dias_minimos?: number;

  @ApiPropertyOptional({ example: 47, description: 'Null = sin tope de edad' })
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(80)
  edad_maxima?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({
    type: [ReglaRequisitoDto],
    description:
      'Si viene, reemplaza la lista completa de requisitos de la versión nueva. Si no viene, se copian los de la versión anterior.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReglaRequisitoDto)
  requisitos?: ReglaRequisitoDto[];
}

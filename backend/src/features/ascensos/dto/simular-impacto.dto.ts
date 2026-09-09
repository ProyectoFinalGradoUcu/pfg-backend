import { IsArray, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReglaRequisitoDto } from './regla-requisito.dto.js';

/** Lo que no venga se toma de la regla vigente. */
export class SimularImpactoDto {
  @ApiPropertyOptional({ example: 1095, description: 'Tiempo mínimo en el grado, en días' })
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

  @ApiPropertyOptional({ type: [ReglaRequisitoDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReglaRequisitoDto)
  requisitos?: ReglaRequisitoDto[];
}

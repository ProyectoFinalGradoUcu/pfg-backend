import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CRITERIOS_SUGERENCIA } from '../derecha.constants.js';
import type { CriterioSugerencia } from '../derecha.constants.js';

export class SugerenciaQueryDto {
  @ApiPropertyOptional({ enum: CRITERIOS_SUGERENCIA, default: 'ANTIGUEDAD' })
  @IsOptional()
  @IsIn([...CRITERIOS_SUGERENCIA])
  criterio?: CriterioSugerencia;
}

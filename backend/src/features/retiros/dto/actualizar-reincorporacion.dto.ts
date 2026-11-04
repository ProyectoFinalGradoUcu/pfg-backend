import { IsInt, IsNumber, IsOptional, IsPositive, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ActualizarReincorporacionDto {
  @ApiPropertyOptional({ example: 3, description: 'Grado del acto de reincorporación' })
  @IsOptional()
  @IsInt()
  grado_reincorporacion_id?: number;

  @ApiPropertyOptional({ example: 45000.5, description: 'Haber de retiro mensual. Va junto con porcentaje_progresivo.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999999999999.99)
  haber_retiro?: number;

  @ApiPropertyOptional({ example: 0.3, description: 'Fracción mayor que 0 y hasta 1. Va junto con haber_retiro.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(1)
  porcentaje_progresivo?: number;
}

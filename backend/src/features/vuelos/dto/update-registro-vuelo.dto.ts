import { IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const HORAS = { maxDecimalPlaces: 1 };
const HORAS_MAX = 99_999;
const UN_DECIMAL = { message: 'Las horas admiten hasta un decimal' };

export class UpdateRegistroVueloDto {
  @ApiPropertyOptional({ example: 5, nullable: true, description: 'Unidad de vuelo. null la deja sin unidad.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  unidad_vuelo_id?: number | null;

  @ApiPropertyOptional({ example: 'UH-1H, AT-92, B-212', nullable: true, description: 'Texto libre' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  aeronaves?: string | null;

  @ApiPropertyOptional({ example: 4.8, description: 'Anexo A: horas Av del año militar' })
  @IsOptional()
  @IsNumber(HORAS, UN_DECIMAL)
  @Min(0)
  @Max(HORAS_MAX)
  hs_av_anio_militar?: number;

  @ApiPropertyOptional({ example: 2671.4, description: 'Anexo A: horas Av totales' })
  @IsOptional()
  @IsNumber(HORAS, UN_DECIMAL)
  @Min(0)
  @Max(HORAS_MAX)
  hs_av_total?: number;

  @ApiPropertyOptional({ example: 4.8, description: 'Anexo B: horas Ob del año militar' })
  @IsOptional()
  @IsNumber(HORAS, UN_DECIMAL)
  @Min(0)
  @Max(HORAS_MAX)
  hs_ob_anio_militar?: number;

  @ApiPropertyOptional({ example: 210.9, description: 'Anexo B: horas Ob totales' })
  @IsOptional()
  @IsNumber(HORAS, UN_DECIMAL)
  @Min(0)
  @Max(HORAS_MAX)
  hs_ob_total?: number;
}

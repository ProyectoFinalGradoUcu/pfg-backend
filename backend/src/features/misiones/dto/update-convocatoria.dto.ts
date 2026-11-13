import { IsString, IsOptional, IsDateString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateConvocatoriaDto {
  @ApiPropertyOptional({ example: 'ORD-2026-001', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  numero_orden?: string | null;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  boletin?: string | null;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  fecha_salida?: string | null;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  fecha_llegada?: string | null;

  @ApiPropertyOptional({ example: 'Observaciones actualizadas' })
  @IsOptional()
  @IsString()
  observaciones?: string | null;
}

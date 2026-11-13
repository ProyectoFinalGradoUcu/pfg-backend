import { IsString, IsOptional, IsDateString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateConvocatoriaDto {
  @ApiPropertyOptional({ example: 'ORD-2026-001', maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string | null;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string | null;

  @ApiPropertyOptional({ example: '2026-03-01', nullable: true })
  @IsOptional()
  @IsDateString()
  fecha_salida?: string | null;

  @ApiPropertyOptional({ example: '2026-09-30', nullable: true })
  @IsOptional()
  @IsDateString()
  fecha_llegada?: string | null;

  @ApiPropertyOptional({ example: 'Observaciones actualizadas', nullable: true })
  @IsOptional()
  @IsString()
  observaciones?: string | null;
}

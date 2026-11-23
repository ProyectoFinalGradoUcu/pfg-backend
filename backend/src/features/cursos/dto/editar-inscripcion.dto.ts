import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Corrige los datos de una inscripción ya registrada. Un campo ausente no se toca;
 * en null se vacía.
 */
export class EditarInscripcionDto {
  @ApiPropertyOptional({ example: 'ORD-1542', maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string | null;

  @ApiPropertyOptional({ example: 'RES-2026-04', maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string | null;

  @ApiPropertyOptional({ example: '2026-03-01', nullable: true })
  @IsOptional()
  @IsDateString()
  fecha_inicio?: string | null;

  @ApiPropertyOptional({ example: '2026-06-30', nullable: true })
  @IsOptional()
  @IsDateString()
  fecha_fin?: string | null;

  @ApiPropertyOptional({ description: 'true aprobado, false desaprobado, null sin resultado (borra también nota y observación).', nullable: true })
  @ValidateIf((o) => o.aprobado !== undefined && o.aprobado !== null)
  @IsBoolean()
  aprobado?: boolean | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  calificacion?: number | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string | null;
}

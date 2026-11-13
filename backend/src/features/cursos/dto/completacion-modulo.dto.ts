import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MarcarCompletacionDto {
  @ApiProperty({ example: 1, description: 'ID de la persona (funcionario)' })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  persona_id: number;

  @ApiPropertyOptional({ example: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  completado?: boolean;

  @ApiPropertyOptional({ example: '2026-05-08' })
  @IsOptional()
  @IsDateString()
  fecha_finalizacion?: string | null;

  @ApiPropertyOptional({ description: 'true si aprobó el módulo, false si lo desaprobó' })
  @IsOptional()
  @IsBoolean()
  aprobado?: boolean | null;

  @ApiPropertyOptional({ description: 'Calificación entera entre 1 y 10', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  calificacion?: number | null;

  @ApiPropertyOptional({ example: 'No alcanzó el mínimo de asistencia', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string | null;

  @ApiPropertyOptional({ example: 'ORD-1542', maxLength: 50, description: 'Orden que designa a la persona a ESTE módulo' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string | null;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, description: 'Boletín donde se publica la orden del módulo (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string | null;
}

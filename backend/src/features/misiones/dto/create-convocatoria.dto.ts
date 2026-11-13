import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  IsInt,
  MaxLength,
  ValidateIf,
  IsNotEmpty,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConvocatoriaDto {
  @ApiPropertyOptional({ example: 'ORD-2026-001', maxLength: 50, description: 'Requerido si no se indica boletín' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((o, value) => value != null || !(typeof o.boletin === 'string' && o.boletin.trim()))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, description: 'Requerido si no se indica número de orden' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((o, value) => value != null || !(typeof o.numero_orden === 'string' && o.numero_orden.trim()))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  fecha_salida?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Puede ser null si no hay fecha de regreso definida' })
  @IsOptional()
  @IsDateString()
  fecha_llegada?: string;

  @ApiPropertyOptional({ example: 'Observaciones de la convocatoria' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiPropertyOptional({ example: [1, 2, 3], description: 'IDs de personas a designar junto con la convocatoria' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  persona_ids?: number[];
}

import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  IsInt,
  MaxLength,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConvocatoriaDto {
  @ApiPropertyOptional({ example: 'ORD-2026-001', maxLength: 50, description: 'Requerido si no se indica boletín' })
  @ValidateIf((o) => !o.boletin)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, description: 'Requerido si no se indica número de orden' })
  @ValidateIf((o) => !o.numero_orden)
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
  persona_ids?: number[];
}

import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReglaRequisitoDto } from './regla-requisito.dto.js';

export class CreateReglaDto {
  @ApiProperty({ example: 'Cbo. 2.ª → Cbo. 1.ª', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ example: 3, description: 'Grado desde el que se asciende' })
  @IsInt()
  grado_origen_id: number;

  @ApiProperty({ example: 4, description: 'Grado al que se asciende' })
  @IsInt()
  grado_destino_id: number;

  @ApiProperty({ example: 730, description: 'Tiempo mínimo en el grado, en días (365 por año)' })
  @IsInt()
  @Min(1)
  dias_minimos: number;

  @ApiPropertyOptional({
    example: 47,
    description: 'Edad máxima para ascender. Null = sin tope, como en los oficiales.',
  })
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(80)
  edad_maxima?: number | null;

  @ApiPropertyOptional({
    example: 'La Ley 19.775 art. 109 dice 5 años; la FAU mantiene 4.',
    description: 'Por qué la regla dice lo que dice, o qué quedó a confirmar.',
  })
  @IsOptional()
  @IsString()
  notas?: string | null;

  @ApiPropertyOptional({ default: true, description: 'Una regla inactiva no la evalúa el motor.' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ type: [ReglaRequisitoDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReglaRequisitoDto)
  requisitos?: ReglaRequisitoDto[];
}

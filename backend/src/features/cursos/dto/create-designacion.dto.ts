import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDesignacionDto {
  @ApiProperty({ example: [1, 2, 3], description: 'IDs de las personas a designar' })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  persona_ids: number[];

  @ApiPropertyOptional({
    example: [10, 11],
    description: 'IDs de módulos a designar. Vacío = designación a nivel curso.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  modulo_ids?: number[];

  @ApiPropertyOptional({ example: 'ORD-1542', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  fecha_fin?: string;
}

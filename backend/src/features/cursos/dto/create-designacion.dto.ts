import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
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

  @ApiPropertyOptional({ example: 'ORD-1542', maxLength: 50, description: 'Requerido si no se indica boletín' })
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

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString()
  fecha_inicio: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  fecha_fin: string;
}

import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateMisionDto {
  @ApiProperty({ example: 'Congo (MONUSCO)', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre_mision: string;

  @ApiProperty({ example: 'República Democrática del Congo', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  pais: string;

  @ApiPropertyOptional({ example: 'O.D. 088/2008', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: '2026-08-20' })
  @IsOptional()
  @IsDateString()
  fecha_orden?: string;

  @ApiPropertyOptional({ example: 'R. 412/2026', maxLength: 50, description: 'Resolución' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: '2026-08-20', description: 'Fecha de la resolución' })
  @IsOptional()
  @IsDateString()
  fecha_boletin?: string;

  @ApiPropertyOptional({ maxLength: 50, deprecated: true, description: 'Sin uso: la resolución va en boletin' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_resolucion?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Sin uso: la resolución va en boletin' })
  @IsOptional()
  @IsDateString()
  fecha_resolucion?: string;

  @ApiPropertyOptional({ example: 'R.CJE. 120/2026', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  resolucion_cje?: string;
}

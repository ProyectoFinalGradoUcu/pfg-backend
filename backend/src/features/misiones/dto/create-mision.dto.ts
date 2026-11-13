import { IsString, IsNotEmpty, MaxLength, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateMisionDto {
  @ApiProperty({ example: 'Congo (MONUSCO)', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @MaxLength(200)
  nombre_mision: string;

  @ApiProperty({ example: 'República Democrática del Congo', maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
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

  @ApiPropertyOptional({ example: 'B.P. 04/2008', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: '2026-08-20' })
  @IsOptional()
  @IsDateString()
  fecha_boletin?: string;

  @ApiPropertyOptional({ example: 'R. 412/2026', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_resolucion?: string;

  @ApiPropertyOptional({ example: '2026-08-20' })
  @IsOptional()
  @IsDateString()
  fecha_resolucion?: string;

  @ApiPropertyOptional({ example: 'R.CJE. 120/2026', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  resolucion_cje?: string;
}

import { IsString, IsOptional, MaxLength, IsDateString, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMisionDto {
  @ApiPropertyOptional({ example: 'Congo (MONUSCO)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre_mision?: string;

  @ApiPropertyOptional({ example: 'República Democrática del Congo', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pais?: string;

  @ApiPropertyOptional({ example: 'O.D. 088/2008', maxLength: 50, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50)
  numero_orden?: string | null;

  @ApiPropertyOptional({ example: '2026-08-20', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  fecha_orden?: string | null;

  @ApiPropertyOptional({ example: 'B.P. 04/2008', maxLength: 50, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50)
  boletin?: string | null;

  @ApiPropertyOptional({ example: '2026-08-20', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  fecha_boletin?: string | null;

  @ApiPropertyOptional({ example: 'R. 412/2026', maxLength: 50, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50)
  numero_resolucion?: string | null;

  @ApiPropertyOptional({ example: '2026-08-20', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  fecha_resolucion?: string | null;

  @ApiPropertyOptional({ example: 'R.CJE. 120/2026', maxLength: 50, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50)
  resolucion_cje?: string | null;
}

import { IsOptional, IsInt, IsString, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FiltroCategoriaPersonal } from '../../../lib/personal/categoria-personal';
import type { CategoriaPersonal } from '../../../lib/personal/categoria-personal';

export class ListPersonalMisionQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'Ana García', description: 'Cédula, nombre o apellido (parcial)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;

  @ApiPropertyOptional({ example: '3,7', description: 'IDs de misión separados por coma' })
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : String(value).split(','))
      .filter((v) => String(v).trim() !== '')
      .map(Number),
  )
  @IsInt({ each: true })
  @Min(1, { each: true })
  misionIds?: number[];

  @ApiPropertyOptional({ example: 'ORD-2026', description: 'Número de orden o boletín (parcial)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  orden?: string;

  @ApiPropertyOptional({ example: false, description: 'true = solo finalizadas, false = solo activas' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  finalizada?: boolean;

  @FiltroCategoriaPersonal()
  categoria?: CategoriaPersonal;
}

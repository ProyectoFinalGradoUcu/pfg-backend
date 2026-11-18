import { IsOptional, IsString, IsInt, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListSubUnidadesQueryDto {
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

  @ApiPropertyOptional({ example: 'B.A.', description: 'Filtra por código o denominación (parcial)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  query?: string;

  @ApiPropertyOptional({ example: 1, description: 'Filtra por comando (unidad de liquidación)' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  unidad_id?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  vigente?: boolean;
}

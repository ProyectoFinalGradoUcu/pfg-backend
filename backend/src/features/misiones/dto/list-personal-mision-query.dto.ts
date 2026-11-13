import { IsOptional, IsInt, Min, Max, IsString, IsIn, IsArray, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @FiltroCategoriaPersonal()
  categoria?: CategoriaPersonal;

  @IsOptional() @IsString() @MaxLength(200)
  query?: string;

  @IsOptional() @IsString() @MaxLength(50)
  documento?: string;

  @IsOptional() @IsIn(['activa', 'finalizada'])
  estado?: 'activa' | 'finalizada';

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')).map(Number))
  @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) @Max(Number.MAX_SAFE_INTEGER, { each: true })
  mision_ids?: number[];
}

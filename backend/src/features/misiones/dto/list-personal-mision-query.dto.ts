import { IsOptional, IsInt, Min, Max } from 'class-validator';
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
}

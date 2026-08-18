import { IsOptional, IsString, IsInt, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListUnidadesQueryDto {
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

  @ApiPropertyOptional({ example: 'Cuartel', description: 'Filtra por denominación (parcial)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  query?: string;

  @ApiPropertyOptional({ example: 'Unidad', description: "'Unidad' u 'Organismo'" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tipo?: string;

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

import { IsOptional, IsString, IsInt, IsBoolean, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListDestinosQueryDto {
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

  @ApiPropertyOptional({ example: '12345678', description: 'Filtra por cédula, nombre o apellido (parcial)' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ example: 5, description: 'Filtra por unidad' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  unidad_id?: number;

  @ApiPropertyOptional({ example: true, description: 'true = destinos vigentes, false = historial' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean;
}

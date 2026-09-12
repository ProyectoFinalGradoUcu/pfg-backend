import { IsOptional, IsString, IsInt, IsBoolean, IsDateString, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const aBooleano = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ListRetirosQueryDto {
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

  @ApiPropertyOptional({ example: 5, description: 'Unidad de la relación laboral cerrada' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  unidad_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'Motivo de baja' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  motivo_baja_id?: number;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'true (default) = solo retiros vigentes, sin revertir ni anular. false = todos los eventos de retiro.',
  })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  vigentes?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Incluir retiros anulados' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  incluir_anulados?: boolean;
}

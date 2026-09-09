import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const toInt = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

const toBool = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ListPersonasQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'juan' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 3, description: 'ID de unidad (destino)' })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  destino?: number;

  @ApiPropertyOptional({ example: 7, description: 'ID de grado (rango)' })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  rango?: number;

  @ApiPropertyOptional({ example: 2, description: 'ID de situación (estado)' })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  estado?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'false (default) lista solo funcionarios con relación laboral abierta. true incluye a los retirados, que traen relacion_estado = "inactivo".',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  incluir_inactivos?: boolean;
}

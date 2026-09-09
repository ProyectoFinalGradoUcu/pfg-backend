import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const aNumero = ({ value }: { value: unknown }) =>
  value === '' || value == null ? undefined : Number(value);

const aBooleano = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ListOrdenesQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({
    example: 2027,
    description: 'Año de la orden. Por defecto, el año en curso.',
  })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1900)
  @Max(2200)
  anio?: number;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({ example: 'O.C.G.F.A. N.º 12.345', description: 'Número de orden (parcial)' })
  @IsOptional()
  @IsString()
  numero_orden?: string;

  @ApiPropertyOptional({ example: 4, description: 'Grado al que ascendieron' })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  grado_destino_id?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  unidad_id?: number;

  @ApiPropertyOptional({ example: 8, description: 'Usuario que registró la orden' })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  registrado_por?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'true = solo anuladas, false = solo vigentes. Sin el filtro, todas.',
  })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  anuladas?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Solo órdenes con algún ascenso por excepción' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  con_excepciones?: boolean;
}

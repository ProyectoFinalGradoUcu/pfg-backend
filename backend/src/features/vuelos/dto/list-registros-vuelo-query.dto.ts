import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FiltroCategoriaPersonal } from '../../../lib/personal/categoria-personal';
import type { CategoriaPersonal } from '../../../lib/personal/categoria-personal';

export const ESTADOS_REGISTRO_VUELO = ['pendientes', 'cargados'] as const;
export type EstadoRegistroVuelo = (typeof ESTADOS_REGISTRO_VUELO)[number];

/** Filtros del listado de un período. La exportación usa los mismos, sin paginar. */
export class FiltrosRegistrosVueloDto {
  @ApiPropertyOptional({ example: 'perez', description: 'Filtra por cédula, nombres o apellidos (parcial)' })
  @IsOptional()
  @IsString()
  query?: string;

  @FiltroCategoriaPersonal()
  categoria?: CategoriaPersonal;

  @ApiPropertyOptional({ example: 20, description: 'Grado que tenía al abrirse el período' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  grado_id?: number;

  @ApiPropertyOptional({ example: 3, description: 'Escalafón que tenía al abrirse el período' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  escalafon_id?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unidad_vuelo_id?: number;

  @ApiPropertyOptional({ example: true, description: 'Solo quienes no tienen unidad de vuelo' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  sin_unidad?: boolean;

  @ApiPropertyOptional({
    enum: ESTADOS_REGISTRO_VUELO,
    description: 'pendientes = nunca editados en el período; cargados = editados. Sin filtro, todos.',
  })
  @IsOptional()
  @IsIn([...ESTADOS_REGISTRO_VUELO])
  estado?: EstadoRegistroVuelo;
}

/** Avance de carga de los períodos, opcionalmente solo de oficiales o de subalternos. */
export class ListPeriodosVueloQueryDto {
  @FiltroCategoriaPersonal()
  categoria?: CategoriaPersonal;
}

export class ListRegistrosVueloQueryDto extends FiltrosRegistrosVueloDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

/** El Excel es por año: una hoja por período; opcionalmente solo oficiales o subalternos. */
export class ExportarVuelosQueryDto {
  @FiltroCategoriaPersonal()
  categoria?: CategoriaPersonal;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2999)
  anio: number;
}

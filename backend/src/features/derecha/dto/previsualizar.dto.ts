import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CambioDerechaDto } from './aplicar-cambios.dto.js';

export const OPERACIONES_PREVISUALIZABLES = [
  'REORDEN',
  'REORDEN_NUMOR',
  'ALTA',
  'BAJA',
  'ASCENSO',
  'CAMBIO_ESCALAFON',
] as const;
export type OperacionPrevisualizable = (typeof OPERACIONES_PREVISUALIZABLES)[number];

/**
 * Qué campos usa cada operación:
 * - REORDEN: grado_id + (persona_id + posicion | orden), o persona_id + derecha y/o numor (valores finales),
 *   o `cambios` (varios de los anteriores, aplicados en orden)
 * - REORDEN_NUMOR: grado_id + escalafon_id + (persona_id + posicion | orden)
 * - ALTA: persona_id, o grado_id + escalafon_id para un funcionario que todavía no existe; posicion y posicion_numor opcionales
 * - BAJA: persona_id
 * - ASCENSO: persona_id + grado_id (destino); posicion y posicion_numor opcionales
 * - CAMBIO_ESCALAFON: persona_id + escalafon_id; posicion_numor opcional
 */
export class PrevisualizarDto {
  @ApiProperty({ enum: OPERACIONES_PREVISUALIZABLES })
  @IsIn([...OPERACIONES_PREVISUALIZABLES])
  operacion: OperacionPrevisualizable;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @IsInt()
  persona_id?: number;

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @IsInt()
  grado_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  escalafon_id?: number;

  @ApiPropertyOptional({ example: 2, description: 'Posición en el grado. Sin valor: al final.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  posicion?: number;

  @ApiPropertyOptional({ example: 1, description: 'Posición en el numor. Sin valor: al final.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  posicion_numor?: number;

  @ApiPropertyOptional({ example: 7, description: 'Derecha final del funcionario (REORDEN por valor)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  derecha?: number;

  @ApiPropertyOptional({ example: 2, description: 'Numor final del funcionario (REORDEN por valor)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  numor?: number;

  @ApiPropertyOptional({ example: [42, 17, 33] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  orden?: number[];

  @ApiPropertyOptional({ type: [CambioDerechaDto], description: 'Lote de cambios (REORDEN)' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CambioDerechaDto)
  cambios?: CambioDerechaDto[];
}

import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Un paso del lote: llevar a un funcionario a una derecha y/o un numor
 * (persona_id + derecha/numor), o reordenar un grado completo (grado_id + orden).
 */
export class CambioDerechaDto {
  @ApiPropertyOptional({ example: 42 })
  @ValidateIf((o) => o.orden === undefined)
  @IsInt()
  persona_id?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  derecha?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  numor?: number;

  @ApiPropertyOptional({ example: 14, description: 'Requerido con `orden`' })
  @ValidateIf((o) => o.orden !== undefined)
  @IsInt()
  grado_id?: number;

  @ApiPropertyOptional({ example: [42, 17, 33], description: 'IDs de persona de todo el grado en el nuevo orden' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  orden?: number[];
}

/** Varios cambios que se aplican en orden y se guardan juntos, en un mismo lote. */
export class AplicarCambiosDto {
  @ApiProperty({ type: [CambioDerechaDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CambioDerechaDto)
  cambios: CambioDerechaDto[];

  @ApiPropertyOptional({ example: 'Corrección según Boletín 12/2026' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

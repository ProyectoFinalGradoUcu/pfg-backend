import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Se manda un movimiento puntual (persona_id + posicion) o el orden completo del grado. */
export class ReordenarDerechaDto {
  @ApiProperty({ example: 14 })
  @IsInt()
  grado_id: number;

  @ApiPropertyOptional({ example: 42, description: 'Requerido si no se manda `orden`' })
  @ValidateIf((o) => o.orden === undefined)
  @IsInt()
  persona_id?: number;

  @ApiPropertyOptional({ example: 2, description: 'Nueva posición dentro del grado (1 = mayor derecha)' })
  @ValidateIf((o) => o.orden === undefined)
  @IsInt()
  @Min(1)
  posicion?: number;

  @ApiPropertyOptional({
    example: [42, 17, 33],
    description: 'IDs de persona de todo el grado en el nuevo orden. Reemplaza a persona_id + posicion.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  orden?: number[];

  @ApiPropertyOptional({ example: 'Corrección según Boletín 12/2026' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

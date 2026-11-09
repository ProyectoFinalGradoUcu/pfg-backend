import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { aCodigo, recortar } from './comando.dto.js';

/** Una base es una fila de `sub_unidades` y siempre pertenece a un comando (`unidad_id`). */
export class CreateBaseDto {
  @ApiProperty({ example: 1, description: 'El comando (unidad) al que pertenece' })
  @IsInt()
  @Min(1)
  unidad_id: number;

  @ApiProperty({ example: 'BAI', maxLength: 30, description: 'Único en todo el catálogo. No se puede cambiar después.' })
  @Transform(aCodigo)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  codigo: string;

  @ApiProperty({ example: 'B.A.I.', maxLength: 150 })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  denominacion: string;
}

export class UpdateBaseDto {
  @ApiPropertyOptional({ example: 'B.A.I.', maxLength: 150 })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  denominacion?: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Mover la base a otro comando. Solo si nunca tuvo personal, destinos ni cursos.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  unidad_id?: number;

  @ApiPropertyOptional({ description: 'false = baja lógica; true = reactivar' })
  @IsOptional()
  @IsBoolean()
  vigente?: boolean;
}

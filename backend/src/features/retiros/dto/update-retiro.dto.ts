import { IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRetiroDto {
  @ApiPropertyOptional({
    example: '2026-08-29',
    description: 'Propaga a relaciones_laborales.fecha_fin',
  })
  @IsOptional()
  @IsDateString()
  fecha_retiro?: string;

  @ApiPropertyOptional({ example: '15:00:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'hora_retiro debe tener formato HH:mm o HH:mm:ss' })
  hora_retiro?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  motivo_baja_id?: number;

  @ApiPropertyOptional({ example: 'Corrección: retiro voluntario' })
  @IsOptional()
  @IsString()
  motivo?: string;

  @ApiPropertyOptional({ example: 'O.D. 12456' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'B.P. 8892' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: 'Observaciones corregidas' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}

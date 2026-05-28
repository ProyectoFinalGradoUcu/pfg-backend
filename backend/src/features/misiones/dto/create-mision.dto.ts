import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMisionDto {
  @ApiPropertyOptional({ example: 'Congo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pais?: string;

  @ApiPropertyOptional({ example: 'Misión de Paz' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tipo_mision?: string;

  @ApiPropertyOptional({ example: '2026-05-09' })
  @IsOptional()
  @IsDateString()
  fecha_salida?: string;

  @ApiPropertyOptional({ example: '2027-05-09' })
  @IsOptional()
  @IsDateString()
  fecha_llegada?: string;

  @ApiPropertyOptional({ example: 'ORD-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'BOL-987' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: 'Observaciones adicionales' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiPropertyOptional({ example: 'Comando Conjunto' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  comando_responsable?: string;
}

import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CerrarDto {
  @ApiPropertyOptional({ example: true, description: 'Cerrar el destino vigente' })
  @IsOptional()
  @IsBoolean()
  destino?: boolean;

  @ApiPropertyOptional({ example: [301], description: 'Ids de inscripciones a dar de baja' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  inscripciones?: number[];

  @ApiPropertyOptional({ example: true, description: 'Bloquear la cuenta de usuario' })
  @IsOptional()
  @IsBoolean()
  usuario?: boolean;
}

export class CreateRetiroDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  persona_id: number;

  @ApiProperty({ example: '2026-08-28', description: 'ISO 8601, sin hora' })
  @IsDateString()
  fecha_retiro: string;

  @ApiPropertyOptional({ example: '14:30:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'hora_retiro debe tener formato HH:mm o HH:mm:ss' })
  hora_retiro?: string;

  @ApiProperty({ example: 1, description: 'Id del catálogo motivos_baja' })
  @IsInt()
  motivo_baja_id: number;

  @ApiPropertyOptional({ example: 'Pase a retiro obligatorio por edad' })
  @IsOptional()
  @IsString()
  motivo?: string;

  @ApiPropertyOptional({ example: 'O.D. 12455' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'B.P. 8891' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: 'Observaciones del acto' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiPropertyOptional({
    type: CerrarDto,
    description: 'Qué cerrar. Si se omite, se aplican los cerrar_sugerido de la previa.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CerrarDto)
  cerrar?: CerrarDto;
}

import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FamiliarDto } from './familiar.dto.js';

export class CreatePersonalDto {
  // --- Datos personales (siempre requeridos) ---

  @ApiProperty({ example: '12345678', maxLength: 12 })
  @IsString()
  @MaxLength(12)
  cedula: string;

  @ApiProperty({ example: 'Juan', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  primer_nombre: string;

  @ApiProperty({ example: 'Pérez', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  primer_apellido: string;

  @ApiPropertyOptional({ example: 'Carlos', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  segundo_nombre?: string;

  @ApiPropertyOptional({ example: 'García', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  segundo_apellido?: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  fecha_nacimiento?: string;

  @ApiPropertyOptional({ example: 'juan.perez@ejemplo.com', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: '099123456', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiPropertyOptional({ example: 'Av. 18 de Julio 1234', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @ApiPropertyOptional({ example: 'M', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  genero?: string;

  @ApiPropertyOptional({ example: 'Soltero', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  estado_civil?: string;

  @ApiPropertyOptional({ example: 'Montevideo, Uruguay', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  lugar_nacimiento?: string;

  @ApiPropertyOptional({ example: 'Mestizo', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  etnia?: string;

  @ApiPropertyOptional({ example: '11300', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  codigo_postal?: string;

  @ApiPropertyOptional({ example: 'Seccional 14', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  seccional?: string;

  @ApiProperty({ example: false, description: 'true si es personal civil' })
  @IsBoolean()
  es_civil: boolean;

  @ApiPropertyOptional({ example: 'Sin observaciones' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  // --- Datos laborales (requeridos solo si es_civil = false) ---

  @ApiPropertyOptional({ example: 'oficial', enum: ['oficial', 'subalterno'] })
  @IsOptional()
  @IsString()
  @IsIn(['oficial', 'subalterno'])
  tipo_funcionario?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  regimen_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  unidad_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  programa_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  situacion_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  escalafon_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  grado_id?: number;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @ApiPropertyOptional({ example: 'A', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  prima_tecnica?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  tiene_mando?: boolean;

  @ApiPropertyOptional({ description: 'ID de sub-unidad (opcional)' })
  @IsOptional()
  @IsInt()
  sub_unidad_id?: number;

  // --- Vínculos familiares (requerido solo si es_civil = true, al menos uno; opcional para el resto) ---

  @ApiPropertyOptional({
    type: [FamiliarDto],
    description: 'Lista de familiares militares asociados. Requerido si es_civil = true (mínimo uno); opcional para oficiales/subalternos.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FamiliarDto)
  familiares?: FamiliarDto[];
}

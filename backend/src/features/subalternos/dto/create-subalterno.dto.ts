import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubalternoDto {
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

  @ApiProperty({ example: 1 })
  @IsInt()
  regimen_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  unidad_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  programa_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  situacion_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  escalafon_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  grado_id: number;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  fecha_inicio: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  compania_id?: number;

  @ApiPropertyOptional({ example: 'Sin observaciones' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}

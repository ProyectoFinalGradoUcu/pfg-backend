import { IsString, IsOptional, IsDateString, IsInt, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePersonalDto {
  // Datos personales
  @ApiPropertyOptional({ example: 'Juan' }) @IsOptional() @IsString() @MaxLength(100) primer_nombre?: string;
  @ApiPropertyOptional({ example: 'Carlos' }) @IsOptional() @IsString() @MaxLength(100) segundo_nombre?: string;
  @ApiPropertyOptional({ example: 'Rodríguez' }) @IsOptional() @IsString() @MaxLength(100) primer_apellido?: string;
  @ApiPropertyOptional({ example: 'García' }) @IsOptional() @IsString() @MaxLength(100) segundo_apellido?: string;
  @ApiPropertyOptional({ example: '1975-03-14' }) @IsOptional() @IsDateString() fecha_nacimiento?: string;
  @ApiPropertyOptional({ example: 'jc@fau.mil.uy' }) @IsOptional() @IsString() @MaxLength(150) email?: string;
  @ApiPropertyOptional({ example: '099 123 456' }) @IsOptional() @IsString() @MaxLength(30) telefono?: string;
  @ApiPropertyOptional({ example: 'Av. 8 de Octubre 2738' }) @IsOptional() @IsString() @MaxLength(200) direccion?: string;
  @ApiPropertyOptional({ example: 'M' }) @IsOptional() @IsString() @MaxLength(20) genero?: string;
  @ApiPropertyOptional({ example: 'Casado' }) @IsOptional() @IsString() @MaxLength(50) estado_civil?: string;
  @ApiPropertyOptional({ example: 'Montevideo' }) @IsOptional() @IsString() @MaxLength(200) lugar_nacimiento?: string;
  @ApiPropertyOptional({ example: 'Mestizo' }) @IsOptional() @IsString() @MaxLength(50) etnia?: string;
  @ApiPropertyOptional({ example: '11300' }) @IsOptional() @IsString() @MaxLength(20) codigo_postal?: string;
  @ApiPropertyOptional({ example: 'Seccional 14' }) @IsOptional() @IsString() @MaxLength(100) seccional?: string;

  // Datos laborales
  @ApiPropertyOptional({ example: 5, description: 'ID del nuevo grado/rango' }) @IsOptional() @IsInt() grado_id?: number;
  @ApiPropertyOptional({ example: 2, description: 'ID de la unidad/destino' }) @IsOptional() @IsInt() unidad_id?: number;
  @ApiPropertyOptional({ example: 1, description: 'ID de la situación/estado' }) @IsOptional() @IsInt() situacion_id?: number;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() regimen_id?: number;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() programa_id?: number;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() escalafon_id?: number;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsInt() sub_unidad_id?: number;
  @ApiPropertyOptional({ example: 'A' }) @IsOptional() @IsString() @MaxLength(10) prima_tecnica?: string;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() tiene_mando?: boolean;
  @ApiPropertyOptional({ example: 'Sin novedades' }) @IsOptional() @IsString() observaciones_laborales?: string;
}

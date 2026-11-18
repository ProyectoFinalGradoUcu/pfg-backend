import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRolDto {
  @ApiProperty({ example: 'Encargado de Misiones' })
  // Se recorta antes de validar para no aceptar nombres de solo espacios.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre del rol tiene que ser un texto' })
  @MinLength(3, { message: 'El nombre del rol tiene que tener al menos 3 caracteres' })
  @MaxLength(60, { message: 'El nombre del rol no puede tener más de 60 caracteres' })
  nombre: string;

  @ApiPropertyOptional({ example: 'Coordina la planificación y seguimiento de misiones operativas' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;

  @ApiPropertyOptional({ type: [String], example: ['misiones.ver', 'misiones.gestionar'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permisos?: string[];
}

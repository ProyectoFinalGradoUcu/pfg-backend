import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRolDto {
  @ApiPropertyOptional({ example: 'Encargado de Cursos' })
  @IsOptional()
  // Se recorta antes de validar para no aceptar nombres de solo espacios.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre del rol tiene que ser un texto' })
  @MinLength(3, { message: 'El nombre del rol tiene que tener al menos 3 caracteres' })
  @MaxLength(60, { message: 'El nombre del rol no puede tener más de 60 caracteres' })
  nombre?: string;

  @ApiPropertyOptional({ example: 'Acceso ampliado al módulo de cursos y certificaciones' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;
}

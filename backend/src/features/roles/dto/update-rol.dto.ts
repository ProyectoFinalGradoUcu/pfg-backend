import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRolDto {
  @ApiPropertyOptional({ example: 'Encargado de Cursos' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  nombre?: string;

  @ApiPropertyOptional({ example: 'Acceso ampliado al módulo de cursos y certificaciones' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;
}

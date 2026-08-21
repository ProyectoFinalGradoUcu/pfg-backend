import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRolDto {
  @ApiProperty({ example: 'Encargado de Misiones' })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
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

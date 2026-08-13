import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUnidadDto {
  @ApiPropertyOptional({ example: 'Escuela de Formación Aeronáutica' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  denominacion?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Una unidad no vigente no se puede asignar a usuarios nuevos, pero conserva su personal e historial.',
  })
  @IsOptional()
  @IsBoolean()
  vigente?: boolean;
}

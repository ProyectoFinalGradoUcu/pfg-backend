import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FamiliarDto {
  @ApiProperty({ example: '87654321', maxLength: 12, description: 'Cédula del familiar (debe ser personal militar ya registrado en el sistema)' })
  @IsString()
  @MaxLength(12)
  cedula: string;

  @ApiPropertyOptional({ example: 'Cónyuge', maxLength: 50, description: 'Tipo de relación (ej: Cónyuge, Hijo/a, Padre/Madre)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipo_relacion?: string;
}

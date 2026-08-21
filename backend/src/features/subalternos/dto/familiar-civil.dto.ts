import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FamiliarCivilDto {
  @ApiProperty({ example: '87654321', maxLength: 12, description: 'Cédula del familiar militar ya registrado en el sistema' })
  @IsString()
  @MaxLength(12)
  cedula: string;

  @ApiPropertyOptional({ example: 'Cónyuge', maxLength: 50, description: 'Tipo de relación (ej: Cónyuge, Hijo/a, Padre/Madre)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipo_relacion?: string;
}

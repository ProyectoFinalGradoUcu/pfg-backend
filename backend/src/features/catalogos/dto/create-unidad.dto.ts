import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUnidadDto {
  @ApiProperty({
    example: 'COA',
    maxLength: 30,
    description: 'Código único. No se puede cambiar después.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  codigo: string;

  @ApiProperty({ example: 'Comando Aéreo de Operaciones (C.O.A.)', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  denominacion: string;

  @ApiPropertyOptional({ example: 'Unidad', maxLength: 100, description: "'Unidad' u 'Organismo'" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tipo?: string;
}

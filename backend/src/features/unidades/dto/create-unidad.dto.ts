import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUnidadDto {
  @ApiProperty({ example: 'EF', description: 'Código único de la unidad' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'El código solo admite letras, números, punto, guion y guion bajo',
  })
  codigo: string;

  @ApiProperty({ example: 'Escuela de Formación' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  denominacion: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  vigente?: boolean;
}

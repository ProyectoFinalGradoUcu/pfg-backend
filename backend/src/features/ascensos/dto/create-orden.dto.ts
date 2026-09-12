import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FuncionarioDeOrdenDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  persona_id: number;

  @ApiPropertyOptional({
    example: 4,
    description:
      'Grado al que asciende. Si se omite, se toma el destino de la regla vigente de su grado.',
  })
  @IsOptional()
  @IsInt()
  grado_destino_id?: number;

  @ApiPropertyOptional({
    example: '2027-02-01',
    description: 'Fecha del ascenso. Si se omite, la de la orden.',
  })
  @IsOptional()
  @IsDateString()
  fecha_ascenso?: string;

  @ApiPropertyOptional({
    example: 'Vacante urgente en la unidad, autorizado por el Comando',
    description:
      'Obligatorio si el funcionario no cumple los requisitos. Además exige el permiso ascensos.excepcion.',
  })
  @IsOptional()
  @IsString()
  motivo_excepcion?: string;
}

export class CreateOrdenDto {
  @ApiPropertyOptional({
    example: 'O.C.G.F.A. N.º 12.345',
    maxLength: 50,
    description: 'Requerido si no se indica boletín',
  })
  @ValidateIf((o) => !o.boletin)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numero_orden?: string;

  @ApiProperty({ example: '2027-02-01' })
  @IsDateString()
  fecha_orden: string;

  @ApiPropertyOptional({
    example: 'BOL-2027-02',
    maxLength: 50,
    description: 'Requerido si no se indica número de orden',
  })
  @ValidateIf((o) => !o.numero_orden)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: 'Ascensos ordinarios al 1.º de febrero' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiProperty({ type: [FuncionarioDeOrdenDto], description: 'Al menos un funcionario' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FuncionarioDeOrdenDto)
  funcionarios: FuncionarioDeOrdenDto[];
}

import {
  IsInt,
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  ValidateIf,
  IsArray,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FuncionarioConvocatoriaItemDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  persona_id: number;

  @ApiPropertyOptional({ example: 'ORD-2026-001', maxLength: 50, description: 'Requerido si no se indica boletín' })
  @ValidateIf((o) => !o.boletin)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, description: 'Requerido si no se indica número de orden' })
  @ValidateIf((o) => !o.numero_orden)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: 'Observaciones del funcionario' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class AddFuncionariosConvocatoriaDto {
  @ApiProperty({ type: () => [FuncionarioConvocatoriaItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FuncionarioConvocatoriaItemDto)
  funcionarios: FuncionarioConvocatoriaItemDto[];
}

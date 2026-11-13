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
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FuncionarioConvocatoriaItemDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  persona_id: number;

  @ApiPropertyOptional({ example: 'ORD-2026-001', maxLength: 50, description: 'Requerido si no se indica boletín' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((o, value) => value != null || !(typeof o.boletin === 'string' && o.boletin.trim()))
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, description: 'Requerido si no se indica número de orden' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((o, value) => value != null || !(typeof o.numero_orden === 'string' && o.numero_orden.trim()))
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

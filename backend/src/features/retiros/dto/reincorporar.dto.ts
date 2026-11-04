import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReincorporarDto {
  @ApiProperty({ example: '2026-10-01', description: 'ISO 8601, sin hora. Posterior a la fecha del retiro.' })
  @IsDateString()
  fecha_reincorporacion: string;

  @ApiProperty({
    example: 3,
    description:
      'Grado del acto de reincorporación. Liquidaciones lo usa para el sueldo base, la compensación y la permanencia.',
  })
  @IsInt()
  grado_reincorporacion_id: number;

  @ApiPropertyOptional({
    example: 45000.5,
    description:
      'Haber de retiro mensual. Va junto con porcentaje_progresivo. Si faltan, liquidación paga sin el descuento hasta que se carguen con el PATCH.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999999999999.99)
  haber_retiro?: number;

  @ApiPropertyOptional({
    example: 0.3,
    description: 'Fracción del haber de retiro que se descuenta del sueldo, mayor que 0 y hasta 1. Va junto con haber_retiro.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(1)
  porcentaje_progresivo?: number;

  @ApiProperty({ example: 5, description: 'Unidad del destino; también queda como unidad de la relación laboral' })
  @IsInt()
  unidad_id: number;

  @ApiPropertyOptional({ example: 'O.D. 13001', maxLength: 50, description: 'Requerido si no se indica boletín' })
  @ValidateIf((o) => !o.boletin)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'B.P. 9012', maxLength: 50, description: 'Requerido si no se indica número de orden' })
  @ValidateIf((o) => !o.numero_orden)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: 'Jefe de Sección', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  posicion_destino?: string;

  @ApiPropertyOptional({ example: 'Reincorporado por O.C.G.F.A. 445' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}

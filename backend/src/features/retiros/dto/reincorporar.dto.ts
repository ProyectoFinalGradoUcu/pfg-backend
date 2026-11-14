import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  ValidateBy,
  ValidateIf,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

// Recorta, y un texto vacío o de solo espacios cuenta como no enviado: así el otro campo pasa a ser
// obligatorio y, si tampoco vino, da 400.
const textoOVacio = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const recortado = value.trim();
  return recortado === '' ? undefined : recortado;
};
const FALTA_RESPALDO = 'Indicá el número de orden o el boletín de la reincorporación';

/** Un solo chequeo, para devolver un solo mensaje de error. */
const TextoDeRespaldo = () =>
  ValidateBy({
    name: 'textoDeRespaldo',
    validator: {
      validate: (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 50,
      defaultMessage: (args?: ValidationArguments) =>
        typeof args?.value === 'string' && args.value.length > 50
          ? `${args.property} admite hasta 50 caracteres`
          : FALTA_RESPALDO,
    },
  });

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

  @ApiProperty({
    example: 3,
    description: 'Base (sub-unidad) a la que vuelve. Queda en el destino y en la relación laboral nuevos; el comando sale de ella.',
  })
  @IsInt()
  sub_unidad_id: number;

  @ApiPropertyOptional({ example: 'O.D. 13001', maxLength: 50, description: 'Requerido si no se indica boletín' })
  @Transform(textoOVacio)
  // Si no vino ninguno de los dos, el error queda acá y no se repite en boletin.
  @ValidateIf((o) => o.numero_orden != null || o.boletin == null)
  @TextoDeRespaldo()
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'B.P. 9012', maxLength: 50, description: 'Requerido si no se indica número de orden' })
  @Transform(textoOVacio)
  @ValidateIf((o) => o.boletin != null)
  @TextoDeRespaldo()
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

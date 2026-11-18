import { IsDateString, IsIn, IsOptional, IsString, MaxLength, ValidateBy, ValidateIf, ValidationArguments } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export const CAMBIOS_SITUACION = ['LICENCIA_SIN_GOCE', 'NO_DISPONIBLE', 'VOLVER_A_ACTIVIDAD'] as const;
export type CambioSituacion = (typeof CAMBIOS_SITUACION)[number];

// Recorta, y un texto vacío cuenta como no enviado: así el otro campo pasa a ser obligatorio.
const textoOVacio = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const recortado = value.trim();
  return recortado === '' ? undefined : recortado;
};
const FALTA_RESPALDO = 'Indicá el número de orden o el boletín del cambio de situación';

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

export class CambiarSituacionDto {
  @ApiProperty({
    enum: CAMBIOS_SITUACION,
    description:
      'LICENCIA_SIN_GOCE: SIT03 (oficiales) o SIT09 (subalternos). NO_DISPONIBLE: SIT04, solo oficiales. ' +
      'VOLVER_A_ACTIVIDAD: vuelve a la situación que tenía antes de la licencia o el No Disponible.',
  })
  @IsIn(CAMBIOS_SITUACION)
  cambio: CambioSituacion;

  @ApiProperty({ example: '2026-11-01', description: 'ISO 8601, sin hora. No puede ser futura: liquidación aplica el cambio en el próximo cálculo.' })
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional({ example: 'O.C.G.F.A. 13001', maxLength: 50, description: 'Requerido si no se indica boletín' })
  @Transform(textoOVacio)
  // Si no vino ninguno de los dos, el error queda acá y no se repite en boletin.
  @ValidateIf((o) => o.numero_orden != null || o.boletin == null)
  @TextoDeRespaldo()
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'B.M.D.N. 9012', maxLength: 50, description: 'Requerido si no se indica número de orden' })
  @Transform(textoOVacio)
  @ValidateIf((o) => o.boletin != null)
  @TextoDeRespaldo()
  boletin?: string;

  @ApiPropertyOptional({ example: 'Licencia por estudios en el exterior', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

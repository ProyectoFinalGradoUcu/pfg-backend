import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ESTADOS_ELEGIBILIDAD = [
  'PASIBLE',
  'PROXIMO',
  'BLOQUEADO',
  'FUERA_DE_EDAD',
  'SIN_REGLA',
  'TOPE_DE_ESCALA',
] as const;

export const ESTADOS_POR_DEFECTO = ['PASIBLE', 'PROXIMO'];

const aNumero = ({ value }: { value: unknown }) =>
  value === '' || value == null ? undefined : Number(value);

export class ListPasiblesQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;

  @ApiPropertyOptional({
    isArray: true,
    enum: ESTADOS_ELEGIBILIDAD,
    description:
      'Estados a incluir. Sin este filtro se devuelven pasibles y próximos, que es lo accionable.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((v) => v.trim()) : value,
  )
  @IsIn([...ESTADOS_ELEGIBILIDAD], { each: true })
  estado?: string[];

  @ApiPropertyOptional({ example: 14, description: 'Escalafón de la relación vigente' })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  escalafon_id?: number;

  @ApiPropertyOptional({ example: 3, description: 'Grado actual' })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  grado_id?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  unidad_id?: number;

  @ApiPropertyOptional({ example: '12345678', description: 'Cédula, nombre o apellido (parcial)' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({
    example: '2027-02-01',
    description:
      'Fecha a la que se evalúa. Por defecto hoy. La pantalla ofrece el atajo «al 1.º de febrero», que es cuando la Ley 19.775 confiere los ascensos de oficiales.',
  })
  @IsOptional()
  @IsDateString()
  fecha_referencia?: string;

  @ApiPropertyOptional({
    example: 6,
    default: 6,
    description: 'Cuántos meses hacia adelante se consideran «próximos».',
  })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1)
  @Max(120)
  horizonte_meses?: number;
}

import { IsOptional, IsString, IsDateString, IsIn, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NIVELES_EDUCATIVOS } from '../legajo-militar.constants.js';

/** Todos los campos son opcionales; mandar `null` explícito borra el dato. */
export class LegajoMilitarDto {
  @ApiPropertyOptional({
    enum: NIVELES_EDUCATIVOS,
    example: 'BACHILLERATO_TECNOLOGICO',
    description:
      'Nivel educativo civil. Habilita Cbo. 2.ª → Cbo. 1.ª sin curso de pasaje a partir de ciclo básico completo.',
  })
  @IsOptional()
  @IsIn([...NIVELES_EDUCATIVOS])
  nivel_educativo?: string | null;

  @ApiPropertyOptional({ example: '2018-03-01', description: 'Ingreso a la Escuela Técnica de Aeronáutica' })
  @IsOptional()
  @IsDateString()
  fecha_ingreso_eta?: string | null;

  @ApiPropertyOptional({
    example: '2020-12-15',
    description: 'Egreso de la ETA. Su presencia distingue al egresado del mutado en AT 2.ª → AT 1.ª.',
  })
  @IsOptional()
  @IsDateString()
  fecha_egreso_eta?: string | null;

  @ApiPropertyOptional({ example: 'O.C.G.F.A. N.º 12.345', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden_egreso_eta?: string | null;

  @ApiPropertyOptional({
    example: 'Mutado del escalafón Servicios Generales al de Aerotécnicos, O.D. 8.221 del 12/03/2021',
    description:
      'Texto libre de la mutación de escalafón. Se guarda en la relación laboral vigente (columna existente `mutaciones`); el motor la lee como booleano.',
  })
  @IsOptional()
  @IsString()
  mutaciones?: string | null;
}

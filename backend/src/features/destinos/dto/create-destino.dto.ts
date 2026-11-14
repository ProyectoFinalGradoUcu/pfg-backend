import {
  IsInt,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsDateString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDestinoDto {
  @ApiProperty({ example: 42, description: 'Funcionario que recibe el destino' })
  @IsInt()
  persona_id: number;

  @ApiProperty({
    example: 5,
    description: 'Sub-unidad en la que pasa a revistar (B.A.I., E.M.A., ...). El comando sale de ella.',
  })
  @IsInt()
  sub_unidad_id: number;

  @ApiProperty({ example: '2026-09-01', description: 'Fecha desde la que revista en la unidad' })
  @IsDateString()
  fecha_inicio: string;

  @ApiPropertyOptional({
    example: '2026-08-15',
    description:
      'Fecha de cierre del destino anterior. Si se omite, se cierra el día previo a fecha_inicio.',
  })
  @IsOptional()
  @IsDateString()
  fecha_fin_anterior?: string;

  @ApiPropertyOptional({ example: 'Jefe de Sección', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  posicion_destino?: string;

  @ApiPropertyOptional({
    example: 'O.D. 12455',
    maxLength: 50,
    description: 'Requerido si no se indica boletín',
  })
  @ValidateIf((o) => !o.boletin)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({
    example: 'BOL-2026-04',
    maxLength: 50,
    description: 'Requerido si no se indica número de orden',
  })
  @ValidateIf((o) => !o.numero_orden)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: '087', maxLength: 20, description: 'Número de destino (Des Num)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero_destino?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Fecha del documento que ordena el destino' })
  @IsOptional()
  @IsDateString()
  fecha_orden?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  fecha_boletin?: string;

  @ApiPropertyOptional({ example: 'R. 412/2026', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_resolucion?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  fecha_resolucion?: string;

  @ApiPropertyOptional({ example: 'Comisión en la ECEMA' })
  @IsOptional()
  @IsString()
  observaciones?: string;
}

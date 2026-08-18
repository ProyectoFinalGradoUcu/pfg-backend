import { IsString, IsOptional, IsDateString, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDestinoDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    nullable: true,
    description: 'null reabre el destino (falla si el funcionario ya tiene otro activo)',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  fecha_fin?: string | null;

  @ApiPropertyOptional({ example: 'Jefe de Estado Mayor', maxLength: 200, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  posicion_destino?: string | null;

  @ApiPropertyOptional({ example: 'O.D. 12455', maxLength: 50, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50)
  numero_orden?: string | null;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50)
  boletin?: string | null;

  @ApiPropertyOptional({ example: 'Comisión en la ECEMA', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  observaciones?: string | null;
}

import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const aNumero = ({ value }: { value: unknown }) =>
  value === '' || value == null ? undefined : Number(value);

export class EstadisticasQueryDto {
  @ApiPropertyOptional({
    example: 2018,
    description: 'Primer año del período. Por defecto, diez años hacia atrás.',
  })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1900)
  @Max(2200)
  anio_desde?: number;

  @ApiPropertyOptional({ example: 2027, description: 'Último año del período. Por defecto, el actual.' })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1900)
  @Max(2200)
  anio_hasta?: number;
}

import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePeriodoVueloDto {
  @ApiProperty({ example: 2026, description: 'Año militar (coincide con el año calendario)' })
  @IsInt()
  @Min(1900)
  @Max(2999)
  anio: number;

  @ApiProperty({ example: 3, minimum: 1, maximum: 4, description: 'Período dentro del año (1 a 4)' })
  @IsInt()
  @Min(1)
  @Max(4)
  numero: number;
}

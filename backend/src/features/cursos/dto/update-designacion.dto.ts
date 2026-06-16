import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDesignacionDto {
  @ApiProperty({ description: 'Calificación entera entre 1 y 10', minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  calificacion: number;
}

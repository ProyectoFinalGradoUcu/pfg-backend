import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePeriodoVueloDto {
  @ApiProperty({ example: true, description: 'true cierra el período (no admite más cambios); false lo reabre' })
  @IsBoolean()
  cerrado: boolean;
}

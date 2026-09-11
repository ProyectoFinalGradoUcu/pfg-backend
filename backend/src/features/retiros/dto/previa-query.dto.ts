import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PreviaQueryDto {
  @ApiProperty({ example: '2026-08-28', description: 'Fecha del retiro a simular (ISO 8601, sin hora)' })
  @IsDateString()
  fecha_retiro: string;
}

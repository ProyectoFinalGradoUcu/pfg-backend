import { IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReordenarDerechaDto } from './reordenar-derecha.dto.js';

export class ReordenarNumorDto extends ReordenarDerechaDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  escalafon_id: number;
}

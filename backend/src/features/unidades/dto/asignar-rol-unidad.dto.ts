import { IsNotEmpty, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AsignarRolUnidadDto {
  @ApiProperty({ example: '3', description: 'Id del rol a asignar a la unidad' })
  @IsNumberString()
  @IsNotEmpty()
  rolId: string;
}

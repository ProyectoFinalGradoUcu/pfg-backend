import { IsArray, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AsignarUnidadesDto {
  @ApiProperty({
    type: [String],
    example: ['1', '2'],
    description:
      'Ids de las unidades del usuario del sistema, o array vacío para dejarlo sin unidades. ' +
      'Son las unidades de la cuenta: definen qué personal ve este usuario y de qué unidades hereda roles.',
  })
  @IsArray()
  @IsNumberString({}, { each: true })
  unidadIds: string[];
}

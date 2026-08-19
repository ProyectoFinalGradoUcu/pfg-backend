import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AsignarUsuariosDto {
  @ApiProperty({
    type: [String],
    example: ['3', '7'],
    description:
      'Ids de los usuarios del sistema a asignar a esta unidad. Cambia usuarios.unidad_id; ' +
      'no toca el destino de ningún funcionario.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsNumberString({}, { each: true })
  usuarioIds: string[];
}

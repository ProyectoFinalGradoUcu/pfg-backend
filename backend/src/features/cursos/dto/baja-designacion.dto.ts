import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BajaDesignacionDto {
  @ApiProperty({
    description: 'Motivo de la baja del funcionario en el curso.',
    minLength: 5,
    maxLength: 500,
    example: 'Solicito la baja por confusión al inscribirlo.',
  })
  @IsString()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres.' })
  @MaxLength(500, { message: 'El motivo no puede superar los 500 caracteres.' })
  motivo: string;
}

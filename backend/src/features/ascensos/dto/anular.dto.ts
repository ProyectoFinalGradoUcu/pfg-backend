import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnularDto {
  @ApiProperty({
    example: 'La orden se dejó sin efecto por resolución del Comando',
    minLength: 5,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  motivo: string;
}

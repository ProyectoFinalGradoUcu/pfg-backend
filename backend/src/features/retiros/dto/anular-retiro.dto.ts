import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnularRetiroDto {
  @ApiProperty({
    example: 'Cargado por error sobre la persona equivocada',
    description: 'Obligatorio: queda registrado en el retiro anulado',
  })
  @IsString()
  @MinLength(5)
  motivo_anulacion: string;
}

import { IsNumberString, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AsignarUnidadDto {
  @ApiProperty({
    example: '1',
    nullable: true,
    description:
      'Id de la unidad del usuario del sistema, o null para dejarlo sin unidad. ' +
      'Es la unidad de la cuenta: define qué personal ve y de qué unidad hereda roles.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumberString()
  unidadId: string | null;
}

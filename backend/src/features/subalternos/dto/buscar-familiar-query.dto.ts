import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class BuscarFamiliarQueryDto {
  @ApiProperty({ example: 'Acosta', description: 'Cédula o nombre; cada palabra tiene que aparecer en algún campo.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Escribí al menos 2 caracteres para buscar' })
  search: string;

  @ApiPropertyOptional({ example: 31, description: 'Persona a la que se le busca familiar: no se ofrece a sí misma.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  excluir?: number;
}

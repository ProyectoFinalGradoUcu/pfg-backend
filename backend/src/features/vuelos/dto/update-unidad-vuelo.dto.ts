import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUnidadVueloDto {
  @ApiPropertyOptional({ example: 'Esc. Aér. 5', maxLength: 100 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  denominacion?: string;

  @ApiPropertyOptional({ example: false, description: 'false la saca de los selectores sin borrar el histórico' })
  @IsOptional()
  @IsBoolean()
  vigente?: boolean;
}

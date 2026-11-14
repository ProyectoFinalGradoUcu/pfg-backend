import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const aCodigo = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** Un comando es una fila de `unidades` (C.A.O., C.A.P., ...). Las bases van en sub-unidades. */
export class CreateComandoDto {
  @ApiProperty({ example: 'CAO', maxLength: 30, description: 'Único. No se puede cambiar después.' })
  @Transform(aCodigo)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  codigo: string;

  @ApiProperty({ example: 'C.A.O.', maxLength: 150 })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  denominacion: string;
}

/** `codigo` no se declara: liquidación y los scripts referencian el catálogo por código. */
export class UpdateComandoDto {
  @ApiPropertyOptional({ example: 'C.A.O.', maxLength: 150 })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  denominacion?: string;

  @ApiPropertyOptional({ description: 'false = baja lógica; true = reactivar' })
  @IsOptional()
  @IsBoolean()
  vigente?: boolean;
}

export { recortar, aCodigo };

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * `codigo` no se declara a propósito: es la clave con la que los seeds y las
 * migraciones referencian las unidades. Al correr el ValidationPipe con
 * `forbidNonWhitelisted`, mandarlo devuelve 400.
 */
export class UpdateUnidadDto {
  @ApiPropertyOptional({ example: 'Comando Aéreo de Operaciones (C.O.A.)', maxLength: 150 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  denominacion?: string;

  @ApiPropertyOptional({ example: 'Unidad', maxLength: 100, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  tipo?: string | null;

  @ApiPropertyOptional({ example: true, description: 'false la saca de los selectores' })
  @IsOptional()
  @IsBoolean()
  vigente?: boolean;
}

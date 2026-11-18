import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/** Campos de texto del multipart de subida. El archivo va aparte, en `archivo`. */
export class SubirDocumentoDto {
  @ApiPropertyOptional({ example: 'Cédula, frente y dorso', maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;
}

/**
 * El único campo editable. Es obligatorio para que un `{}` no borre la descripción por
 * accidente: `null` o vacío la quitan a propósito.
 */
export class ActualizarDocumentoDto {
  @ApiProperty({ example: 'Cédula, frente y dorso', maxLength: 200, nullable: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_dto, valor) => valor !== null)
  @IsDefined({ message: 'descripcion es obligatoria (null para quitarla)' })
  @IsString()
  @MaxLength(200)
  descripcion: string | null;
}

export class UsuarioQueSubioDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'admin@fau.mil.uy' })
  username: string;
}

export class DocumentoPersonalDto {
  @ApiProperty({ example: '12' })
  id: string;

  @ApiPropertyOptional({ example: 'Cédula, frente y dorso', nullable: true })
  descripcion: string | null;

  @ApiProperty({ example: 'cedula.pdf' })
  nombre_original: string;

  @ApiProperty({ example: 'application/pdf' })
  content_type: string;

  @ApiProperty({ example: '184223' })
  tamanio_bytes: string;

  @ApiProperty({ example: '2026-09-30T19:40:00.000Z' })
  subido_en: string;

  @ApiPropertyOptional({ type: UsuarioQueSubioDto, nullable: true })
  subido_por: UsuarioQueSubioDto | null;
}

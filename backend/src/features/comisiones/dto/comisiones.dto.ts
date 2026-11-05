import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { OmitType, PartialType } from '@nestjs/swagger';
import { FiltroCategoriaPersonal } from '../../../lib/personal/categoria-personal';
import type { CategoriaPersonal } from '../../../lib/personal/categoria-personal';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const booleano = ({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value;

export class CreateComisionDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
  denominacion: string;
}
export class UpdateComisionDto extends PartialType(CreateComisionDto) {
  @ValidateIf((_, value) => value !== undefined) @IsBoolean()
  vigente?: boolean;
}
export class ListComisionesDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER)
  page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(200)
  pageSize?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  query?: string;
  @IsOptional() @Transform(booleano) @IsBoolean()
  vigente?: boolean;
  @IsOptional() @Transform(booleano) @IsBoolean()
  activo?: boolean;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER)
  persona_id?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER)
  comision_id?: number;
  @FiltroCategoriaPersonal()
  categoria?: CategoriaPersonal;
}
export class CreateAsignacionComisionDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  cargo?: string | null;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER)
  persona_id: number;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER)
  comision_id: number;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_inicio: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_fin?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  numero_orden?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  boletin?: string | null;
}
export class CreateLoteAsignacionesComisionDto extends OmitType(CreateAsignacionComisionDto, ['persona_id'] as const) {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ArrayUnique()
  @IsInt({ each: true }) @Min(1, { each: true }) @Max(Number.MAX_SAFE_INTEGER, { each: true })
  persona_ids: number[];
}

export class UpdateAsignacionComisionDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  cargo?: string | null;
  @ValidateIf((_, value) => value !== undefined) @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_inicio?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha_fin?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  numero_orden?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  boletin?: string | null;
}

import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  MaxLength,
} from 'class-validator';

export class CreateSubalternoDto {

  @IsString()
  @MaxLength(12)
  cedula: string;

  @IsString()
  @MaxLength(100)
  primer_nombre: string;

  @IsString()
  @MaxLength(100)
  primer_apellido: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  segundo_nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  segundo_apellido?: string;

  @IsOptional()
  @IsDateString()
  fecha_nacimiento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  genero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  estado_civil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lugar_nacimiento?: string;


  @IsInt()
  regimen_id: number;

  @IsInt()
  unidad_id: number;

  @IsInt()
  programa_id: number;

  @IsInt()
  situacion_id: number;

  @IsInt()
  escalafon_id: number;

  @IsInt()
  grado_id: number;

  @IsDateString()
  fecha_inicio: string;

  @IsOptional()
  @IsInt()
  compania_id?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

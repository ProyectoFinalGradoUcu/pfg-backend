import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSubalternoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;
}

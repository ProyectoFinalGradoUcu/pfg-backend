import { IsString, IsInt, IsOptional, IsIn, IsNotEmpty, Min, MaxLength, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHistorialCursoDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personaId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  institucion: string;

  @ApiProperty({ enum: ['obligatorio', 'optativo'] })
  @IsIn(['obligatorio', 'optativo'])
  tipo: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}

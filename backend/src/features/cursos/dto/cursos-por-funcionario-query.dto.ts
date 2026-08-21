import { IsOptional, IsString, MaxLength, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CursosPorFuncionarioQueryDto {
  @ApiPropertyOptional({ example: '12345678', description: 'Cédula del funcionario para filtrar sus cursos' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  cedula?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Si es true, incluye también las inscripciones dadas de baja. Por defecto solo se devuelven las activas.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluir_bajas?: boolean;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

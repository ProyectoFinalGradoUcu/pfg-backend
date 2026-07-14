import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListAuditoriaQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Filtrar por id de usuario' })
  @IsOptional()
  @IsString()
  usuarioId?: string;

  @ApiPropertyOptional({ description: 'Filtrar por nombre de acción (ej. CREAR)' })
  @IsOptional()
  @IsString()
  accion?: string;

  @ApiPropertyOptional({ description: 'Filtrar por nombre de contexto (ej. Roles)' })
  @IsOptional()
  @IsString()
  contexto?: string;

  @ApiPropertyOptional({ description: 'Filtrar por entidad (ej. Rol)' })
  @IsOptional()
  @IsString()
  entidad?: string;

  @ApiPropertyOptional({ description: 'Id de la entidad afectada' })
  @IsOptional()
  @IsString()
  entidadId?: string;

  @ApiPropertyOptional({ description: 'Fecha desde (ISO 8601)', example: '2026-01-01' })
  @IsOptional()
  @IsString()
  desde?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta (ISO 8601)', example: '2026-12-31' })
  @IsOptional()
  @IsString()
  hasta?: string;
}

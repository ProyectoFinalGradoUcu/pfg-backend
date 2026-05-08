import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CursosPorFuncionarioQueryDto {
  @ApiPropertyOptional({ example: '12345678', description: 'Cédula del funcionario para filtrar sus cursos' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  cedula?: string;
}

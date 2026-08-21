import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class CustomReporteDto {
  @ApiProperty({ example: 'personal' })
  @IsString()
  fuente: string;

  @ApiProperty({ type: [String], example: ['cedula', 'apellido', 'grado'] })
  @IsArray()
  @IsString({ each: true })
  columnas: string[];

  @ApiPropertyOptional({ type: Object, example: { estado: 'activo' } })
  @IsOptional()
  @IsObject()
  filtros?: Record<string, string>;
}

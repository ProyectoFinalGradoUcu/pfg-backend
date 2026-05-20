import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MarcarCompletacionDto {
  @ApiProperty({ example: 1, description: 'ID de la persona (funcionario)' })
  persona_id: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  completado?: boolean;

  @ApiPropertyOptional({ example: '2026-05-08' })
  @IsOptional()
  @IsDateString()
  fecha_finalizacion?: string;

  @ApiPropertyOptional({ example: 'Aprobado', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  calificacion?: string;
}

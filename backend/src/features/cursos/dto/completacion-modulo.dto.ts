import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MarcarCompletacionDto {
  @ApiProperty({ example: 1, description: 'ID de la persona (funcionario)' })
  @IsInt()
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

  @ApiPropertyOptional({ example: 'ORD-1542', maxLength: 50, description: 'Orden que designa a la persona a ESTE módulo' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numero_orden?: string;

  @ApiPropertyOptional({ example: 'BOL-2026-04', maxLength: 50, description: 'Boletín donde se publica la orden del módulo (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;
}

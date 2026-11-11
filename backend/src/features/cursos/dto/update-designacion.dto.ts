import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDesignacionDto {
  @ApiProperty({ description: 'true si la persona aprobó el curso, false si lo desaprobó' })
  @IsBoolean()
  aprobado: boolean;

  @ApiPropertyOptional({ description: 'Calificación entera entre 1 y 10. Omitir conserva; null limpia.', minimum: 1, maximum: 10, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  calificacion?: number | null;

  @ApiPropertyOptional({ example: 'No alcanzó el mínimo de asistencia', description: 'Omitir conserva; null limpia.', maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string | null;
}

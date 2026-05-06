import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUsuarioDto {
  @ApiPropertyOptional({ enum: ['activo', 'bloqueado'] })
  @IsOptional()
  @IsIn(['activo', 'bloqueado'])
  estado?: 'activo' | 'bloqueado';

  @ApiPropertyOptional({ example: '1542' })
  @IsOptional()
  @IsString()
  personaId?: string | null;
}

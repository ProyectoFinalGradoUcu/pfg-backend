import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FuncionarioMisionDto {
  @ApiProperty({ example: '1' })
  @IsString()
  persona_id: string;

  @ApiPropertyOptional({ example: 'BOL-123' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  boletin?: string;

  @ApiPropertyOptional({ example: 'Sin observaciones' })
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiPropertyOptional({ example: 'MIG-88223' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  numero_control_migratorio?: string;
}

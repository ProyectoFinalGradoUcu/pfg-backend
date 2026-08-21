import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMisionDto {
  @ApiPropertyOptional({ example: 'Congo (MONUSCO)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre_mision?: string;

  @ApiPropertyOptional({ example: 'República Democrática del Congo', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pais?: string;
}

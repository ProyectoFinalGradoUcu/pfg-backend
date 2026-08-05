import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMisionDto {
  @ApiProperty({ example: 'Congo (MONUSCO)', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre_mision: string;

  @ApiProperty({ example: 'República Democrática del Congo', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  pais: string;
}

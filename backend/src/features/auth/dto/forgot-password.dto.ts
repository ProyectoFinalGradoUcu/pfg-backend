import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'silva.g@fau.mil.uy' })
  @IsString()
  @MaxLength(150)
  username: string;
}

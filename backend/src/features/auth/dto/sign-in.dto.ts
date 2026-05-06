import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInDto {
  @ApiProperty({ example: 'alvarez.m@fau.mil.uy' })
  @IsEmail()
  @MaxLength(60)
  username: string;

  @ApiProperty({ example: 'MiClaveSegura1*' })
  @IsString()
  @MinLength(6)
  @MaxLength(255)
  password: string;
}

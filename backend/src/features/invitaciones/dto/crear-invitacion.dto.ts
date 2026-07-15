import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CrearInvitacionDto {
  @ApiProperty({ example: 'silva.g@fau.mil.uy' })
  @IsEmail()
  @MaxLength(150)
  email: string;

  @ApiPropertyOptional({ example: '1542', description: 'ID de la persona vinculada' })
  @IsOptional()
  @IsString()
  personaId?: string;

  @ApiPropertyOptional({ example: ['Oficina de Personal'], description: 'Roles a asignar al crear el usuario' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

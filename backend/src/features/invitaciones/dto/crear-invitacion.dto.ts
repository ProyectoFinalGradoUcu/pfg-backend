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
  // Máximo 60: al aceptar, el email pasa a `usuarios.username`, que es varchar(60).
  @MaxLength(60, { message: 'El email no puede tener más de 60 caracteres' })
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

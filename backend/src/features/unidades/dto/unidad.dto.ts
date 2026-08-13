import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PermisoDeRolDto {
  @ApiProperty({ example: '9' })
  id: string;

  @ApiProperty({ example: 'cursos.gestionar' })
  nombre: string;
}

export class RolDeUnidadDto {
  @ApiProperty({ example: '3' })
  id: string;

  @ApiProperty({ example: 'Control de cursos' })
  nombre: string;

  @ApiPropertyOptional({ example: 'Administra la formación de la unidad' })
  descripcion: string | null;

  @ApiProperty({ type: [PermisoDeRolDto] })
  permisos: PermisoDeRolDto[];
}

export class UnidadListItemDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'CG' })
  codigo: string;

  @ApiProperty({ example: 'Cuartel General' })
  denominacion: string;

  @ApiProperty({ example: true })
  vigente: boolean;

  @ApiProperty({ example: 2 })
  cantidadRoles: number;

  @ApiProperty({ example: 14, description: 'Usuarios con relación laboral activa en la unidad' })
  cantidadUsuarios: number;
}

export class UnidadDetalleDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'CG' })
  codigo: string;

  @ApiProperty({ example: 'Cuartel General' })
  denominacion: string;

  @ApiProperty({ example: true })
  vigente: boolean;

  @ApiProperty({ type: [RolDeUnidadDto] })
  roles: RolDeUnidadDto[];

  @ApiProperty({ example: 14 })
  cantidadUsuarios: number;
}

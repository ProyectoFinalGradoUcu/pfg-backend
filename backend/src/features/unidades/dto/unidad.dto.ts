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

export class ComandoDeUnidadDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'CAO' })
  codigo: string;

  @ApiProperty({ example: 'C.A.O.' })
  denominacion: string;
}

export class UnidadListItemDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'BAI' })
  codigo: string;

  @ApiProperty({ example: 'B.A.I.' })
  denominacion: string;

  @ApiProperty({ example: true })
  vigente: boolean;

  @ApiProperty({ type: ComandoDeUnidadDto })
  comando: ComandoDeUnidadDto;

  @ApiProperty({ example: 2 })
  cantidadRoles: number;

  @ApiProperty({ example: 14, description: 'Usuarios con relación laboral activa en la unidad' })
  cantidadUsuarios: number;
}

export class UnidadDetalleDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'BAI' })
  codigo: string;

  @ApiProperty({ example: 'B.A.I.' })
  denominacion: string;

  @ApiProperty({ example: true })
  vigente: boolean;

  @ApiProperty({ type: ComandoDeUnidadDto })
  comando: ComandoDeUnidadDto;

  @ApiProperty({ type: [RolDeUnidadDto] })
  roles: RolDeUnidadDto[];

  @ApiProperty({ example: 14 })
  cantidadUsuarios: number;
}

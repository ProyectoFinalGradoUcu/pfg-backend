import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UnidadesService } from './unidades.service';
import { ListUnidadesQueryDto } from './dto/list-unidades-query.dto';
import { AsignarRolUnidadDto } from './dto/asignar-rol-unidad.dto';
import { CreateUnidadDto } from './dto/create-unidad.dto';
import { UpdateUnidadDto } from './dto/update-unidad.dto';
import { AsignarUsuariosDto } from './dto/asignar-usuarios.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Auditar } from '../auditoria/decorators/auditar.decorator';

@ApiTags('Unidades')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Unidades', entidad: 'Unidad' })
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly unidadesService: UnidadesService) {}

  @Get()
  @RequirePermissions('unidades.ver')
  @ApiOperation({
    summary: 'Listar unidades',
    description: 'Devuelve las unidades con su cantidad de roles y de usuarios.',
  })
  @ApiResponse({ status: 200, description: 'Listado paginado de unidades.' })
  findAll(@Query() query: ListUnidadesQueryDto) {
    return this.unidadesService.findAll(query);
  }

  @Post()
  @RequirePermissions('unidades.gestionar')
  @ApiOperation({
    summary: 'Crear unidad',
    description: 'El código se normaliza a mayúsculas y debe ser único.',
  })
  @ApiResponse({ status: 201, description: 'Unidad creada.' })
  @ApiResponse({ status: 409, description: 'Ya existe una unidad con ese código.' })
  create(@Body() dto: CreateUnidadDto) {
    return this.unidadesService.create(dto);
  }

  @Get(':id')
  @RequirePermissions('unidades.ver')
  @ApiOperation({
    summary: 'Detalle de unidad',
    description: 'Devuelve la unidad con los roles asignados y los permisos que aportan.',
  })
  @ApiResponse({ status: 200, description: 'Unidad encontrada.' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada.' })
  findOne(@Param('id') id: string) {
    return this.unidadesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('unidades.gestionar')
  @ApiOperation({
    summary: 'Editar unidad',
    description:
      'Permite cambiar denominación y vigencia. El código no se edita: es la referencia estable de la unidad.',
  })
  @ApiResponse({ status: 200, description: 'Unidad actualizada.' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada.' })
  update(@Param('id') id: string, @Body() dto: UpdateUnidadDto) {
    return this.unidadesService.update(id, dto);
  }

  @Get(':id/usuarios')
  @RequirePermissions('unidades.ver')
  @ApiOperation({
    summary: 'Usuarios del sistema asignados a la unidad',
    description:
      'Cuentas de la aplicación que pertenecen a esta unidad. No es el personal destinado acá.',
  })
  @ApiResponse({ status: 200, description: 'Listado de usuarios.' })
  findUsuarios(@Param('id') id: string) {
    return this.unidadesService.findUsuarios(id);
  }

  @Post(':id/usuarios')
  @RequirePermissions('unidades.gestionar', 'usuarios.gestionar')
  @ApiOperation({
    summary: 'Asignar usuarios del sistema a la unidad',
    description:
      'Cambia la unidad de la cuenta, con lo que pasan a heredar los roles de la unidad. ' +
      'Les cierra la sesión activa. No modifica el destino de ningún funcionario.',
  })
  @ApiResponse({ status: 201, description: 'Resumen de la asignación.' })
  @ApiResponse({ status: 409, description: 'La unidad no está vigente.' })
  asignarUsuarios(@Param('id') id: string, @Body() dto: AsignarUsuariosDto) {
    return this.unidadesService.asignarUsuarios(id, dto.usuarioIds);
  }

  @Delete(':id/usuarios/:usuarioId')
  @RequirePermissions('unidades.gestionar', 'usuarios.gestionar')
  @ApiOperation({
    summary: 'Quitar un usuario de la unidad',
    description: 'El usuario queda sin unidad y opera solo con sus permisos globales.',
  })
  @ApiResponse({ status: 200, description: 'Usuario quitado de la unidad.' })
  @ApiResponse({ status: 404, description: 'El usuario no pertenece a esta unidad.' })
  quitarUsuario(@Param('id') id: string, @Param('usuarioId') usuarioId: string) {
    return this.unidadesService.quitarUsuario(id, usuarioId);
  }

  @Post(':id/roles')
  @RequirePermissions('unidades.gestionar')
  @ApiOperation({
    summary: 'Asignar rol a una unidad',
    description:
      'Todos los usuarios de la unidad heredan los permisos del rol. Invalida sus sesiones activas.',
  })
  @ApiResponse({ status: 201, description: 'Rol asignado.' })
  @ApiResponse({ status: 404, description: 'Unidad o rol no encontrado.' })
  @ApiResponse({ status: 409, description: 'El rol ya estaba asignado.' })
  asignarRol(@Param('id') id: string, @Body() dto: AsignarRolUnidadDto) {
    return this.unidadesService.asignarRol(id, dto.rolId);
  }

  @Delete(':id/roles/:rolId')
  @RequirePermissions('unidades.gestionar')
  @ApiOperation({
    summary: 'Quitar rol de una unidad',
    description:
      'Los usuarios de la unidad dejan de heredar esos permisos. Invalida sus sesiones activas.',
  })
  @ApiResponse({ status: 200, description: 'Rol quitado.' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada o rol no asignado.' })
  quitarRol(@Param('id') id: string, @Param('rolId') rolId: string) {
    return this.unidadesService.quitarRol(id, rolId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ListUsuariosQueryDto } from './dto/list-usuarios-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';

@ApiTags('Usuarios')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Auditar({ contexto: 'Usuarios', entidad: 'Usuario' })
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @RequirePermissions('usuarios.ver')
  @ApiOperation({ summary: 'Listar usuarios con sus roles' })
  findAll(@Query() query: ListUsuariosQueryDto) {
    return this.usuariosService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('usuarios.ver')
  @ApiOperation({ summary: 'Obtener un usuario por id' })
  findOne(@Param('id') id: string) {
    return this.usuariosService.findOne(id);
  }

  @Post()
  @RequirePermissions('usuarios.gestionar')
  @ApiOperation({ summary: 'Crear un nuevo usuario' })
  create(@Body() dto: CreateUsuarioDto) {
    return this.usuariosService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('usuarios.gestionar')
  @ApiOperation({ summary: 'Actualizar estado o persona vinculada de un usuario' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usuariosService.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('usuarios.gestionar')
  @ApiOperation({ summary: 'Bloquear (soft delete) un usuario' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usuariosService.remove(id, user.id);
  }

  @Post(':id/roles/:rolId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('usuarios.gestionar')
  @Auditar({ contexto: 'Usuarios', accion: 'ASIGNAR', entidad: 'Usuario' })
  @ApiOperation({ summary: 'Asignar un rol a un usuario' })
  asignarRol(@Param('id') id: string, @Param('rolId') rolId: string) {
    return this.usuariosService.asignarRol(id, rolId);
  }

  @Delete(':id/roles/:rolId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('usuarios.gestionar')
  @Auditar({ contexto: 'Usuarios', accion: 'DESASIGNAR', entidad: 'Usuario' })
  @ApiOperation({ summary: 'Quitar un rol a un usuario' })
  quitarRol(
    @Param('id') id: string,
    @Param('rolId') rolId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usuariosService.quitarRol(id, rolId, user.id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('usuarios.gestionar')
  @Auditar({ contexto: 'Usuarios', accion: 'RESETEAR_PASSWORD', entidad: 'Usuario' })
  @ApiOperation({ summary: 'Resetear la contraseña de un usuario' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.usuariosService.resetPassword(id, dto);
  }
}

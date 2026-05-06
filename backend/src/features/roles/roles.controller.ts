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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Roles')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles.ver')
  @ApiOperation({ summary: 'Listar roles con sus permisos asignados' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('roles.ver')
  @ApiOperation({ summary: 'Obtener un rol por id' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermissions('roles.gestionar')
  @ApiOperation({ summary: 'Crear un nuevo rol' })
  create(@Body() dto: CreateRolDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('roles.gestionar')
  @ApiOperation({ summary: 'Actualizar nombre o descripción de un rol' })
  update(@Param('id') id: string, @Body() dto: UpdateRolDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('roles.gestionar')
  @ApiOperation({ summary: 'Eliminar un rol (solo si no es base ni tiene usuarios)' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }

  @Put(':id/permisos/:permisoId')
  @RequirePermissions('roles.gestionar')
  @ApiOperation({ summary: 'Activar un permiso para el rol' })
  activarPermiso(
    @Param('id') id: string,
    @Param('permisoId') permisoId: string,
  ) {
    return this.rolesService.activarPermiso(id, permisoId);
  }

  @Delete(':id/permisos/:permisoId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('roles.gestionar')
  @ApiOperation({ summary: 'Desactivar un permiso para el rol' })
  desactivarPermiso(
    @Param('id') id: string,
    @Param('permisoId') permisoId: string,
  ) {
    return this.rolesService.desactivarPermiso(id, permisoId);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermisosService } from './permisos.service';
import { ListPermisosQueryDto } from './dto/list-permisos-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Permisos')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permisos')
export class PermisosController {
  constructor(private readonly permisosService: PermisosService) {}

  @Get()
  @RequirePermissions('roles.ver')
  @ApiOperation({ summary: 'Listar el catálogo fijo de permisos del sistema' })
  findAll(@Query() query: ListPermisosQueryDto) {
    return this.permisosService.findAll(query);
  }
}

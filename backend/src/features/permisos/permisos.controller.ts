import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermisosService } from './permisos.service';
import { ListPermisosQueryDto } from './dto/list-permisos-query.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Permisos')
@ApiCookieAuth('auth_token')
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

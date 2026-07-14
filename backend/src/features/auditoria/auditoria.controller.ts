import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { ListAuditoriaQueryDto } from './dto/list-auditoria-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Auditoría')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @RequirePermissions('auditoria.ver')
  @ApiOperation({ summary: 'Listar la bitácora de auditoría con filtros y paginado' })
  listar(@Query() query: ListAuditoriaQueryDto) {
    return this.auditoriaService.listar(query);
  }

  @Get('filtros')
  @RequirePermissions('auditoria.ver')
  @ApiOperation({ summary: 'Obtener acciones y contextos disponibles para los filtros' })
  filtros() {
    return this.auditoriaService.filtros();
  }
}

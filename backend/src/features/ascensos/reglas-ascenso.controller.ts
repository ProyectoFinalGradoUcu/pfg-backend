import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ReglasAscensoService } from './reglas-ascenso.service.js';
import { ElegibilidadService } from './elegibilidad.service.js';
import { CreateReglaDto } from './dto/create-regla.dto.js';
import { UpdateReglaDto } from './dto/update-regla.dto.js';
import { ListReglasQueryDto } from './dto/list-reglas-query.dto.js';
import { SimularImpactoDto } from './dto/simular-impacto.dto.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';

const idDeUsuario = (user?: AuthenticatedUser) =>
  user?.id != null ? BigInt(user.id) : null;

@ApiTags('Reglas de ascenso')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Reglas de ascenso', entidad: 'Regla de ascenso' })
@Controller('ascensos/reglas')
export class ReglasAscensoController {
  constructor(
    private readonly reglasService: ReglasAscensoService,
    private readonly elegibilidad: ElegibilidadService,
  ) {}

  // Las rutas literales van antes de /:id para que Express no las tome como un id.

  @Get()
  @ApiOperation({
    summary:
      'La escala completa como escalera: una columna por escalafón, un escalón por tramo',
  })
  @RequirePermissions('reglas_ascenso.ver')
  listarEscalera(@Query() query: ListReglasQueryDto) {
    return this.reglasService.listarEscalera(query);
  }

  @Get('catalogo-cursos')
  @ApiOperation({
    summary: 'Catálogo de cursos para vincular a un requisito, en el editor de reglas',
  })
  @RequirePermissions('reglas_ascenso.ver')
  listarCursosDelCatalogo() {
    return this.reglasService.listarCursosDelCatalogo();
  }

  @Post('restaurar-defecto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Vuelve a las reglas de la FAU: cierra las vigentes y reabre la versión por defecto de cada tramo',
  })
  @RequirePermissions('reglas_ascenso.gestionar')
  @Auditar({
    contexto: 'Reglas de ascenso',
    entidad: 'Regla de ascenso',
    accion: 'regla_ascenso.restaurar',
    incluirRespuesta: true,
  })
  restaurarDefecto(@CurrentUser() user: AuthenticatedUser) {
    return this.reglasService.restaurarDefecto(idDeUsuario(user));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una regla para un tramo que todavía no tiene' })
  @RequirePermissions('reglas_ascenso.gestionar')
  @Auditar({
    contexto: 'Reglas de ascenso',
    entidad: 'Regla de ascenso',
    incluirRespuesta: true,
  })
  crear(@Body() dto: CreateReglaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reglasService.crear(dto, idDeUsuario(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una regla con sus requisitos y sus versiones anteriores' })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('reglas_ascenso.ver')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.reglasService.obtener(id);
  }

  @Get(':id/versiones')
  @ApiOperation({ summary: 'Todas las versiones del tramo, de la más nueva a la más vieja' })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('reglas_ascenso.ver')
  listarVersiones(@Param('id', ParseIntPipe) id: number) {
    return this.reglasService.listarVersiones(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar una regla. No la sobreescribe: cierra la vigente y crea una versión nueva.',
  })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('reglas_ascenso.gestionar')
  @Auditar({
    contexto: 'Reglas de ascenso',
    entidad: 'Regla de ascenso',
    incluirRespuesta: true,
  })
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReglaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reglasService.editar(id, dto, idDeUsuario(user));
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar una regla: el motor deja de evaluarla' })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('reglas_ascenso.gestionar')
  @Auditar({
    contexto: 'Reglas de ascenso',
    entidad: 'Regla de ascenso',
    accion: 'regla_ascenso.desactivar',
  })
  desactivar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reglasService.desactivar(id, idDeUsuario(user));
  }

  @Post(':id/impacto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Simula el cambio antes de guardarlo: cuántos pasan a pasibles y cuántos dejan de serlo',
  })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('reglas_ascenso.gestionar')
  simularImpacto(@Param('id', ParseIntPipe) id: number, @Body() dto: SimularImpactoDto) {
    return this.elegibilidad.simularImpacto(id, dto);
  }

  @Post(':id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Volver a activar una regla desactivada' })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('reglas_ascenso.gestionar')
  activar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.reglasService.activar(id, idDeUsuario(user));
  }
}

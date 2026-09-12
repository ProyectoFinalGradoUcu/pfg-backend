import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ElegibilidadService } from './elegibilidad.service.js';
import { OrdenesAscensoService } from './ordenes-ascenso.service.js';
import { EstadisticasAscensoService } from './estadisticas-ascenso.service.js';
import { ListPasiblesQueryDto } from './dto/list-pasibles-query.dto.js';
import { ListOrdenesQueryDto } from './dto/list-ordenes-query.dto.js';
import { CreateOrdenDto } from './dto/create-orden.dto.js';
import { AnularDto } from './dto/anular.dto.js';
import { EstadisticasQueryDto } from './dto/estadisticas-query.dto.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator.js';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';

@ApiTags('Ascensos')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Ascensos', entidad: 'Ascenso' })
@Controller('ascensos')
export class AscensosController {
  constructor(
    private readonly elegibilidad: ElegibilidadService,
    private readonly ordenes: OrdenesAscensoService,
    private readonly estadisticas: EstadisticasAscensoService,
  ) {}

  // Las rutas literales van antes de las que tienen parámetro.

  @Get('pasibles')
  @ApiOperation({
    summary:
      'Listado evaluado de funcionarios: quién puede ascender, a quién le falta y por qué',
  })
  @RequireAlcance('ascensos.ver')
  listarPasibles(
    @Query() query: ListPasiblesQueryDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.elegibilidad.listarPasibles(query, alcance);
  }

  @Get('resumen')
  @ApiOperation({
    summary: 'Contadores por estado, escalafón y unidad, y qué cursos frenan más ascensos',
  })
  @RequireAlcance('ascensos.ver')
  resumen(@Query() query: ListPasiblesQueryDto, @Alcance() alcance: AlcanceResuelto) {
    return this.elegibilidad.resumen(query, alcance);
  }

  @Get('estadisticas')
  @ApiOperation({
    summary: 'Totales de ascensos y anulaciones del período, y dotación por grado',
  })
  @RequireAlcance('ascensos.ver')
  verEstadisticas(
    @Query() query: EstadisticasQueryDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.estadisticas.estadisticas(query, alcance);
  }

  @Get('elegibilidad/:personaId')
  @ApiOperation({ summary: 'Evaluación completa de un funcionario, requisito por requisito' })
  @ApiParam({ name: 'personaId', type: Number })
  @RequireAlcance('ascensos.ver')
  evaluarPersona(
    @Param('personaId', ParseIntPipe) personaId: number,
    @Query('fecha_referencia') fechaReferencia: string | undefined,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.elegibilidad.evaluarPersona(personaId, fechaReferencia, alcance);
  }

  // ─── Órdenes ─────────────────────────────────────────────────────────────

  @Get('ordenes')
  @ApiOperation({ summary: 'Órdenes de ascenso del período, con sus totales' })
  @RequireAlcance('ascensos.ver')
  listarOrdenes(
    @Query() query: ListOrdenesQueryDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.ordenes.listar(query, alcance);
  }

  @Get('ordenes/:id')
  @ApiOperation({
    summary: 'Detalle de una orden: sus funcionarios y la foto de evaluación de cada uno',
  })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('ascensos.ver')
  obtenerOrden(@Param('id', ParseIntPipe) id: number) {
    return this.ordenes.obtener(id);
  }

  @Post('ordenes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Registra una orden con N funcionarios. Cierra la relación vigente de cada uno y abre la nueva con el grado que usa liquidación.',
  })
  @RequirePermissions('ascensos.registrar')
  @Auditar({
    contexto: 'Ascensos',
    entidad: 'Orden de ascenso',
    accion: 'ascenso.registrar',
    incluirRespuesta: true,
  })
  crearOrden(@Body() dto: CreateOrdenDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ordenes.crear(
      dto,
      user?.id != null ? BigInt(user.id) : null,
      user?.permisos ?? [],
    );
  }

  @Post('ordenes/:id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anula la orden completa. Solo si todos sus ascensos siguen siendo reversibles.',
  })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('ascensos.anular')
  @Auditar({ contexto: 'Ascensos', entidad: 'Orden de ascenso', accion: 'orden_ascenso.anular' })
  anularOrden(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordenes.anularOrden(id, dto.motivo, user?.id != null ? BigInt(user.id) : null);
  }

  @Post(':ascensoId/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anula un ascenso puntual sin tocar el resto de la orden' })
  @ApiParam({ name: 'ascensoId', type: Number })
  @RequirePermissions('ascensos.anular')
  @Auditar({ contexto: 'Ascensos', entidad: 'Ascenso', accion: 'ascenso.anular' })
  anularAscenso(
    @Param('ascensoId', ParseIntPipe) ascensoId: number,
    @Body() dto: AnularDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordenes.anularAscenso(
      ascensoId,
      dto.motivo,
      user?.id != null ? BigInt(user.id) : null,
    );
  }
}

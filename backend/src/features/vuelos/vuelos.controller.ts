import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { VuelosService } from './vuelos.service';
import { CreatePeriodoVueloDto } from './dto/create-periodo-vuelo.dto';
import { UpdatePeriodoVueloDto } from './dto/update-periodo-vuelo.dto';
import { UpdateRegistroVueloDto } from './dto/update-registro-vuelo.dto';
import {
  ExportarVuelosQueryDto,
  ListPeriodosVueloQueryDto,
  ListRegistrosVueloQueryDto,
} from './dto/list-registros-vuelo-query.dto';
import { CreateUnidadVueloDto } from './dto/create-unidad-vuelo.dto';
import { UpdateUnidadVueloDto } from './dto/update-unidad-vuelo.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Alcance, RequireAlcance } from '../../lib/alcance/alcance.decorator';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';
import { enviarExcel } from '../../lib/carga-masiva';

const usuarioId = (user?: AuthenticatedUser) => (user?.id != null ? BigInt(user.id) : null);

/**
 * Abrir, cerrar y borrar períodos y el catálogo de unidades de vuelo son de alcance
 * global; ver y cargar horas admite la variante `.unidad` para que cada unidad cargue
 * a su propio personal.
 */
@ApiTags('Vuelos')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Vuelos', entidad: 'Registro de vuelo' })
@Controller('vuelos')
export class VuelosController {
  constructor(private readonly vuelosService: VuelosService) {}

  // ─── Unidades de vuelo ─────────────────────────────────────────────────────

  @Get('unidades')
  @ApiOperation({ summary: 'Catálogo de unidades de vuelo (vigentes y dadas de baja)' })
  @RequireAlcance('vuelos.ver')
  listarUnidades() {
    return this.vuelosService.listarUnidades();
  }

  @Post('unidades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una unidad de vuelo' })
  @RequirePermissions('vuelos.gestionar')
  @Auditar({ contexto: 'Vuelos', entidad: 'Unidad de vuelo', incluirRespuesta: true })
  crearUnidad(@Body() dto: CreateUnidadVueloDto) {
    return this.vuelosService.crearUnidad(dto);
  }

  @Patch('unidades/:unidadId')
  @ApiOperation({ summary: 'Renombrar, dar de baja o reactivar una unidad de vuelo' })
  @RequirePermissions('vuelos.gestionar')
  @Auditar({ contexto: 'Vuelos', entidad: 'Unidad de vuelo' })
  editarUnidad(@Param('unidadId', ParseIntPipe) unidadId: number, @Body() dto: UpdateUnidadVueloDto) {
    return this.vuelosService.editarUnidad(unidadId, dto);
  }

  // ─── Períodos ──────────────────────────────────────────────────────────────

  @Get('periodos')
  @ApiOperation({ summary: 'Períodos de vuelo, del más reciente al más viejo, con su avance de carga' })
  @RequireAlcance('vuelos.ver')
  listarPeriodos(@Query() query: ListPeriodosVueloQueryDto, @Alcance() alcance: AlcanceResuelto) {
    return this.vuelosService.listarPeriodos(alcance, query.categoria);
  }

  @Post('periodos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Abrir un período: genera una fila por cada oficial y subalterno en actividad',
  })
  @RequirePermissions('vuelos.gestionar')
  @Auditar({ contexto: 'Vuelos', entidad: 'Período de vuelo', incluirRespuesta: true })
  crearPeriodo(@Body() dto: CreatePeriodoVueloDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vuelosService.crearPeriodo(dto, usuarioId(user));
  }

  @Post('periodos/:periodoId/sincronizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agregar al período al personal que entró en actividad después de abrirlo' })
  @RequirePermissions('vuelos.gestionar')
  @Auditar({ contexto: 'Vuelos', entidad: 'Período de vuelo', accion: 'ACTUALIZAR', incluirRespuesta: true })
  sincronizarPeriodo(@Param('periodoId', ParseIntPipe) periodoId: number) {
    return this.vuelosService.sincronizarPeriodo(periodoId);
  }

  @Patch('periodos/:periodoId')
  @ApiOperation({ summary: 'Cerrar o reabrir un período' })
  @RequirePermissions('vuelos.gestionar')
  @Auditar({ contexto: 'Vuelos', entidad: 'Período de vuelo' })
  actualizarPeriodo(
    @Param('periodoId', ParseIntPipe) periodoId: number,
    @Body() dto: UpdatePeriodoVueloDto,
  ) {
    return this.vuelosService.actualizarPeriodo(periodoId, dto);
  }

  @Delete('periodos/:periodoId')
  @ApiOperation({ summary: 'Eliminar un período abierto por error (solo si no tiene nada cargado)' })
  @RequirePermissions('vuelos.gestionar')
  @Auditar({ contexto: 'Vuelos', entidad: 'Período de vuelo' })
  eliminarPeriodo(@Param('periodoId', ParseIntPipe) periodoId: number) {
    return this.vuelosService.eliminarPeriodo(periodoId);
  }

  // ─── Registros ─────────────────────────────────────────────────────────────

  @Get('exportar')
  @ApiOperation({ summary: 'Exportar a Excel las horas de vuelo de un año, una hoja por período, opcionalmente de una categoría' })
  @RequireAlcance('vuelos.ver')
  async exportarAnio(
    @Query() query: ExportarVuelosQueryDto,
    @Alcance() alcance: AlcanceResuelto,
    @Res() res: Response,
  ) {
    const { buffer, nombreArchivo } = await this.vuelosService.exportarAnio(query.anio, alcance, query.categoria);
    enviarExcel(res, buffer, nombreArchivo);
  }

  @Get('periodos/:periodoId/registros')
  @ApiOperation({ summary: 'Registros del período paginados, con horas del período calculadas' })
  @RequireAlcance('vuelos.ver')
  listarRegistros(
    @Param('periodoId', ParseIntPipe) periodoId: number,
    @Query() query: ListRegistrosVueloQueryDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.vuelosService.listarRegistros(periodoId, query, alcance);
  }

  @Patch('registros/:registroId')
  @ApiOperation({ summary: 'Cargar unidad de vuelo, aeronaves y horas de una persona en un período' })
  @RequireAlcance('vuelos.gestionar')
  editarRegistro(
    @Param('registroId', ParseIntPipe) registroId: number,
    @Body() dto: UpdateRegistroVueloDto,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.vuelosService.editarRegistro(registroId, dto, usuarioId(user), alcance);
  }

  @Get('personas/:personaId/historial')
  @ApiOperation({ summary: 'Horas de vuelo de una persona en todos los períodos y sus cambios de unidad' })
  @RequireAlcance('vuelos.ver')
  historialPersona(
    @Param('personaId', ParseIntPipe) personaId: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.vuelosService.historialPersona(personaId, alcance);
  }
}

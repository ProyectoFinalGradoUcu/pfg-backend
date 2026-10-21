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
import { DerechaService } from './derecha.service.js';
import { ReordenarDerechaDto } from './dto/reordenar-derecha.dto.js';
import { ReordenarNumorDto } from './dto/reordenar-numor.dto.js';
import { PrevisualizarDto } from './dto/previsualizar.dto.js';
import { HistorialDerechaQueryDto } from './dto/historial-query.dto.js';
import { SugerenciaQueryDto } from './dto/sugerencia-query.dto.js';
import { AplicarCambiosDto } from './dto/aplicar-cambios.dto.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';
import { RequireAlcance } from '../../lib/alcance/alcance.decorator.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';

const usuarioId = (user?: AuthenticatedUser) => (user?.id != null ? BigInt(user.id) : null);

@ApiTags('Configuración derecha personal')
@ApiCookieAuth('auth_token')
@Controller('configuracion-derecha')
export class DerechaController {
  constructor(private readonly derecha: DerechaService) {}

  @Get('escalas')
  @ApiOperation({ summary: 'Escalas de derecha con sus grados, cantidad en actividad y rango de derecha' })
  @RequireAlcance('personas.ver')
  listarEscalas() {
    return this.derecha.listarEscalas();
  }

  @Get('personal')
  @ApiOperation({ summary: 'Todo el personal en actividad con derecha, por escala y derecha, con grado, escalafón y numor' })
  @RequireAlcance('personas.ver')
  listarPersonal() {
    return this.derecha.listarPersonal();
  }

  @Get('grados/:gradoId')
  @ApiOperation({ summary: 'Personal en actividad del grado ordenado por derecha, con su rango de derecha' })
  @ApiParam({ name: 'gradoId', type: Number })
  @RequireAlcance('personas.ver')
  obtenerGrado(@Param('gradoId', ParseIntPipe) gradoId: number) {
    return this.derecha.obtenerGrado(gradoId);
  }

  @Get('grados/:gradoId/sugerencia')
  @ApiOperation({
    summary: 'Orden sugerido para el grado (antigüedad en el grado / egreso ETA). No persiste nada.',
  })
  @ApiParam({ name: 'gradoId', type: Number })
  @RequirePermissions('derecha.gestionar')
  sugerirOrden(
    @Param('gradoId', ParseIntPipe) gradoId: number,
    @Query() query: SugerenciaQueryDto,
  ) {
    return this.derecha.sugerirOrden(gradoId, query.criterio);
  }

  @Get('numor/:gradoId/:escalafonId')
  @ApiOperation({ summary: 'Grupo (grado, escalafón) ordenado por numor' })
  @ApiParam({ name: 'gradoId', type: Number })
  @ApiParam({ name: 'escalafonId', type: Number })
  @RequireAlcance('personas.ver')
  obtenerGrupoNumor(
    @Param('gradoId', ParseIntPipe) gradoId: number,
    @Param('escalafonId', ParseIntPipe) escalafonId: number,
  ) {
    return this.derecha.obtenerGrupoNumor(gradoId, escalafonId);
  }

  @Post('previsualizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Funcionarios afectados por una operación, antes y después. No persiste nada.' })
  @RequireAlcance('personas.ver')
  previsualizar(@Body() dto: PrevisualizarDto) {
    return this.derecha.previsualizar(dto);
  }

  @Patch('reordenar')
  @ApiOperation({ summary: 'Reordena la derecha dentro de un grado' })
  @RequirePermissions('derecha.gestionar')
  @Auditar({ contexto: 'Derecha', entidad: 'Derecha', accion: 'derecha.reordenar', incluirRespuesta: true })
  reordenar(@Body() dto: ReordenarDerechaDto, @CurrentUser() user: AuthenticatedUser) {
    const ctx = { motivo: dto.motivo, usuarioId: usuarioId(user) };
    return dto.orden
      ? this.derecha.ordenarGrado(dto.grado_id, dto.orden, ctx)
      : this.derecha.reordenarEnGrado(dto.grado_id, dto.persona_id!, dto.posicion!, ctx);
  }

  @Patch('cambios')
  @ApiOperation({ summary: 'Aplica varios cambios de derecha y numor en orden y los guarda en un mismo lote' })
  @RequirePermissions('derecha.gestionar')
  @Auditar({ contexto: 'Derecha', entidad: 'Derecha', accion: 'derecha.cambios', incluirRespuesta: true })
  aplicarCambios(@Body() dto: AplicarCambiosDto, @CurrentUser() user: AuthenticatedUser) {
    return this.derecha.aplicarCambios(dto.cambios, { motivo: dto.motivo, usuarioId: usuarioId(user) });
  }

  @Patch('numor/reordenar')
  @ApiOperation({ summary: 'Reordena el numor dentro de un grupo (grado, escalafón)' })
  @RequirePermissions('derecha.gestionar')
  @Auditar({ contexto: 'Derecha', entidad: 'Numor', accion: 'numor.reordenar', incluirRespuesta: true })
  reordenarNumor(@Body() dto: ReordenarNumorDto, @CurrentUser() user: AuthenticatedUser) {
    const ctx = { motivo: dto.motivo, usuarioId: usuarioId(user) };
    return dto.orden
      ? this.derecha.ordenarNumor(dto.grado_id, dto.escalafon_id, dto.orden, ctx)
      : this.derecha.reordenarNumor(dto.grado_id, dto.escalafon_id, dto.persona_id!, dto.posicion!, ctx);
  }

  @Get('historial')
  @ApiOperation({ summary: 'Auditoría de cambios de derecha y numor' })
  @RequireAlcance('personas.ver')
  historial(@Query() query: HistorialDerechaQueryDto) {
    return this.derecha.historial(query);
  }
}

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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiResponse, ApiBody } from '@nestjs/swagger';
import { RetirosService } from './retiros.service';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';
import { ListRetirosQueryDto } from './dto/list-retiros-query.dto';
import { PreviaQueryDto } from './dto/previa-query.dto';
import { CreateRetiroDto } from './dto/create-retiro.dto';
import { UpdateRetiroDto } from './dto/update-retiro.dto';
import { AnularRetiroDto } from './dto/anular-retiro.dto';
import { ReincorporarDto } from './dto/reincorporar.dto';
import { ActualizarReincorporacionDto } from './dto/actualizar-reincorporacion.dto';
import {
  ActualizarReincorporacionRequestDto,
  AnularRetiroRequestDto,
  CreateRetiroRequestDto,
  ReincorporarRequestDto,
  UpdateRetiroRequestDto,
} from './dto/retiro-request.dto';

@ApiTags('Retiros')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Retiros', entidad: 'Retiro' })
@Controller('retiros')
export class RetirosController {
  constructor(private readonly retirosService: RetirosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar retiros paginados' })
  @RequirePermissions('retiros.ver')
  listar(@Query() query: ListRetirosQueryDto) {
    return this.retirosService.listar(query);
  }

  @Get('previa/:personaId')
  @ApiOperation({
    summary: 'Simular el impacto de retirar a un funcionario',
    description:
      'Solo lectura: no escribe nada. Devuelve qué se cerraría y, en bloqueos, por qué no se podría retirar.',
  })
  @ApiResponse({ status: 404, description: 'Persona no encontrada.' })
  @RequirePermissions('retiros.ver')
  previa(@Param('personaId', ParseIntPipe) personaId: number, @Query() query: PreviaQueryDto) {
    return this.retirosService.previa(personaId, query.fecha_retiro);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar el retiro de un funcionario',
    description:
      'Cierra la relación laboral, registra el movimiento y aplica los cierres elegidos. Recalcula el impacto: la respuesta informa qué cerró de verdad.',
  })
  @ApiResponse({ status: 201, description: 'Retiro registrado.' })
  @ApiResponse({ status: 404, description: 'Persona no encontrada.' })
  @ApiResponse({ status: 422, description: 'El funcionario no puede retirarse; ver bloqueos en la previa.' })
  @ApiBody({ type: CreateRetiroRequestDto })
  @RequirePermissions('retiros.registrar')
  registrar(
    @Body('service_request') dto: CreateRetiroDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.retirosService.registrar(dto, BigInt(user.id));
  }

  @Get(':retiroId')
  @ApiOperation({ summary: 'Detalle de un retiro' })
  @ApiResponse({ status: 404, description: 'Retiro no encontrado.' })
  @RequirePermissions('retiros.ver')
  obtener(@Param('retiroId', ParseIntPipe) retiroId: number) {
    return this.retirosService.obtener(retiroId);
  }

  @Patch(':retiroId')
  @ApiOperation({
    summary: 'Corregir un retiro cargado mal',
    description:
      'Campos declarativos. Si cambia fecha_retiro, propaga a relaciones_laborales.fecha_fin y a la fecha del movimiento del retiro. No reajusta los destinos ni las inscripciones que ya cerró.',
  })
  @ApiResponse({
    status: 400,
    description:
      'fecha_retiro futura, anterior al inicio de la relación que cierra o a su último movimiento, o no anterior a la reincorporación.',
  })
  @ApiResponse({ status: 409, description: 'El retiro está anulado.' })
  @ApiBody({ type: UpdateRetiroRequestDto })
  @RequirePermissions('retiros.registrar')
  corregir(
    @Param('retiroId', ParseIntPipe) retiroId: number,
    @Body('service_request') dto: UpdateRetiroDto,
  ) {
    return this.retirosService.corregir(retiroId, dto);
  }

  @Delete(':retiroId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular un retiro cargado por error',
    description:
      'Baja lógica para un retiro cargado por error. Reabre la relación laboral, borra el movimiento que el retiro creó y deshace los cierres de cierres_aplicados.',
  })
  @ApiResponse({ status: 200, description: 'Retiro anulado; informa qué revirtió.' })
  @ApiResponse({
    status: 409,
    description:
      'El retiro ya estaba anulado, es histórico o importado, el funcionario tiene fecha de fallecimiento o una relación activa, o la relación que cerró ya no es la más reciente.',
  })
  @ApiBody({ type: AnularRetiroRequestDto })
  @RequirePermissions('retiros.registrar')
  @Auditar({ contexto: 'Retiros', entidad: 'Retiro', accion: 'retiro.anular' })
  anular(
    @Param('retiroId', ParseIntPipe) retiroId: number,
    @Body('service_request') dto: AnularRetiroDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.retirosService.anular(retiroId, dto, BigInt(user.id));
  }

  @Get(':retiroId/reincorporacion/previa')
  @ApiOperation({
    summary: 'Simular la reincorporación de un funcionario retirado',
    description:
      'Solo lectura. Devuelve la situación que tendría la relación nueva, lo que se copia de la relación cerrada, el destino abierto si lo hay y, en bloqueos, por qué no se podría reincorporar.',
  })
  @ApiResponse({ status: 404, description: 'Retiro no encontrado.' })
  @RequirePermissions('retiros.ver')
  previaReincorporacion(@Param('retiroId', ParseIntPipe) retiroId: number) {
    return this.retirosService.previaReincorporacion(retiroId);
  }

  @Post(':retiroId/reincorporacion')
  @ApiOperation({
    summary: 'Reincorporar a un funcionario retirado',
    description:
      'Abre una relación laboral nueva con situación SIT16 o SIT17, copia los datos de carrera de la cerrada, registra el movimiento Reincorporacion y asigna el destino. No reabre la relación cerrada ni toca el retiro.',
  })
  @ApiResponse({ status: 201, description: 'Funcionario reincorporado; informa lo que se creó.' })
  @ApiResponse({
    status: 409,
    description: 'Retiro anulado, funcionario con relación activa, o no es su retiro más reciente.',
  })
  @ApiResponse({ status: 422, description: 'Datos inválidos; ver bloqueos en la previa.' })
  @ApiBody({ type: ReincorporarRequestDto })
  @RequirePermissions('retiros.registrar')
  reincorporar(
    @Param('retiroId', ParseIntPipe) retiroId: number,
    @Body('service_request') dto: ReincorporarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.retirosService.reincorporar(retiroId, dto, BigInt(user.id));
  }

  @Delete(':retiroId/reincorporacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular una reincorporación cargada por error',
    description:
      'Borra la relación laboral que abrió la reincorporación (con su situación SIT16/SIT17 y su movimiento), borra el destino que asignó, reabre el que cerró y saca al funcionario de la derecha. Después se puede anular el retiro.',
  })
  @ApiResponse({ status: 200, description: 'Reincorporación anulada; informa qué revirtió.' })
  @ApiResponse({
    status: 409,
    description:
      'Retiro anulado, sin reincorporación, o la reincorporación ya tiene ascensos, un retiro posterior, otros movimientos, destinos posteriores o liquidaciones.',
  })
  @ApiBody({ type: AnularRetiroRequestDto })
  @RequirePermissions('retiros.registrar')
  @Auditar({ contexto: 'Retiros', entidad: 'Reincorporación', accion: 'reincorporacion.anular' })
  anularReincorporacion(
    @Param('retiroId', ParseIntPipe) retiroId: number,
    @Body('service_request') dto: AnularRetiroDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.retirosService.anularReincorporacion(retiroId, dto, BigInt(user.id));
  }

  @Patch(':retiroId/reincorporacion')
  @ApiOperation({
    summary: 'Cargar o corregir los datos de cálculo de una reincorporación',
    description:
      'Haber de retiro y porcentaje progresivo (siempre juntos) y grado de reincorporación, sobre la relación que abrió la reincorporación. Solo mientras esa relación siga activa. Devuelve el detalle del retiro.',
  })
  @ApiResponse({
    status: 409,
    description: 'Retiro anulado, sin reincorporación posterior, o la relación de la reincorporación ya está cerrada.',
  })
  @ApiResponse({ status: 422, description: 'Haber sin porcentaje o al revés, grado inválido, o la relación posterior no es SIT16/SIT17.' })
  @ApiBody({ type: ActualizarReincorporacionRequestDto })
  @RequirePermissions('retiros.registrar')
  actualizarReincorporacion(
    @Param('retiroId', ParseIntPipe) retiroId: number,
    @Body('service_request') dto: ActualizarReincorporacionDto,
  ) {
    return this.retirosService.actualizarReincorporacion(retiroId, dto);
  }
}

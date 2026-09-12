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
import {
  AnularRetiroRequestDto,
  CreateRetiroRequestDto,
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
      'Campos declarativos. Si cambia fecha_retiro, propaga a relaciones_laborales.fecha_fin. No reajusta los destinos ni las inscripciones que ya cerró.',
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
  @ApiResponse({ status: 409, description: 'El retiro ya estaba anulado.' })
  @ApiBody({ type: AnularRetiroRequestDto })
  @RequirePermissions('retiros.registrar')
  anular(
    @Param('retiroId', ParseIntPipe) retiroId: number,
    @Body('service_request') dto: AnularRetiroDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.retirosService.anular(retiroId, dto, BigInt(user.id));
  }
}

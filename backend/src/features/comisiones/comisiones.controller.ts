import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Alcance, RequireAlcance } from '../../lib/alcance/alcance.decorator';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';
import { ComisionesService } from './comisiones.service';
import { CreateAsignacionComisionDto, CreateLoteAsignacionesComisionDto, CreateComisionDto, ListComisionesDto, UpdateAsignacionComisionDto, UpdateComisionDto } from './dto/comisiones.dto';

function idSeguro(id: string): bigint {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new BadRequestException('ID inválido');
  return BigInt(id);
}

@ApiTags('Comisiones')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Comisiones', entidad: 'Comisión', incluirRespuesta: true })
@Controller('comisiones')
export class ComisionesController {
  constructor(private readonly service: ComisionesService) {}

  @Get('asignaciones') @RequireAlcance('comisiones.ver')
  asignaciones(@Query() query: ListComisionesDto, @Alcance() alcance: AlcanceResuelto) { return this.service.listarAsignaciones(query, alcance); }

  @Get('asignaciones/:id') @RequireAlcance('comisiones.ver')
  asignacion(@Param('id') id: string, @Alcance() alcance: AlcanceResuelto) { return this.service.obtenerAsignacion(idSeguro(id), alcance); }

  @Post('asignaciones') @RequireAlcance('comisiones.gestionar')
  @Auditar({ contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true })
  crearAsignacion(@Body('service_request') dto: CreateAsignacionComisionDto, @Alcance() alcance: AlcanceResuelto) { return this.service.crearAsignacion(dto, alcance); }

  @Post('asignaciones/lote') @RequireAlcance('comisiones.gestionar')
  @Auditar({ contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true })
  crearLote(@Body('service_request') dto: CreateLoteAsignacionesComisionDto, @Alcance() alcance: AlcanceResuelto) { return this.service.crearLote(dto, alcance); }

  @Patch('asignaciones/:id') @RequireAlcance('comisiones.gestionar')
  @Auditar({ contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true })
  editarAsignacion(@Param('id') id: string, @Body('service_request') dto: UpdateAsignacionComisionDto, @Alcance() alcance: AlcanceResuelto) { return this.service.editarAsignacion(idSeguro(id), dto, alcance); }

  @Delete('asignaciones/:id') @RequireAlcance('comisiones.gestionar')
  @Auditar({ contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true })
  eliminarAsignacion(@Param('id') id: string, @Alcance() alcance: AlcanceResuelto) { return this.service.eliminarAsignacion(idSeguro(id), alcance); }

  @Get() @RequireAlcance('comisiones.ver')
  listar(@Query() query: ListComisionesDto, @Alcance() alcance: AlcanceResuelto) { return this.service.listar(query, alcance); }

  @Post() @RequirePermissions('comisiones.gestionar')
  crear(@Body('service_request') dto: CreateComisionDto) { return this.service.crear(dto); }

  @Get(':id/funcionarios') @RequireAlcance('comisiones.ver')
  funcionarios(@Param('id') id: string, @Query() query: ListComisionesDto, @Alcance() alcance: AlcanceResuelto) { return this.service.funcionarios(idSeguro(id), query, alcance); }

  @Get(':id') @RequireAlcance('comisiones.ver')
  obtener(@Param('id') id: string, @Alcance() alcance: AlcanceResuelto) { return this.service.obtener(idSeguro(id), alcance); }

  @Patch(':id') @RequirePermissions('comisiones.gestionar')
  editar(@Param('id') id: string, @Body('service_request') dto: UpdateComisionDto) { return this.service.editar(idSeguro(id), dto); }
}

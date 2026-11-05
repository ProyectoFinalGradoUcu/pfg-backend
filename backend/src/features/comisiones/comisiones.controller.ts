import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
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

  @Get('asignaciones') @RequirePermissions('comisiones.ver')
  asignaciones(@Query() query: ListComisionesDto) { return this.service.listarAsignaciones(query); }

  @Get('asignaciones/:id') @RequirePermissions('comisiones.ver')
  asignacion(@Param('id') id: string) { return this.service.obtenerAsignacion(idSeguro(id)); }

  @Post('asignaciones') @RequirePermissions('comisiones.gestionar')
  @Auditar({ contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true })
  crearAsignacion(@Body('service_request') dto: CreateAsignacionComisionDto) { return this.service.crearAsignacion(dto); }

  @Post('asignaciones/lote') @RequirePermissions('comisiones.gestionar')
  @Auditar({ contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true })
  crearLote(@Body('service_request') dto: CreateLoteAsignacionesComisionDto) { return this.service.crearLote(dto); }

  @Patch('asignaciones/:id') @RequirePermissions('comisiones.gestionar')
  @Auditar({ contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true })
  editarAsignacion(@Param('id') id: string, @Body('service_request') dto: UpdateAsignacionComisionDto) { return this.service.editarAsignacion(idSeguro(id), dto); }

  @Delete('asignaciones/:id') @RequirePermissions('comisiones.gestionar')
  @Auditar({ contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true })
  eliminarAsignacion(@Param('id') id: string) { return this.service.eliminarAsignacion(idSeguro(id)); }

  @Get() @RequirePermissions('comisiones.ver')
  listar(@Query() query: ListComisionesDto) { return this.service.listar(query); }

  @Post() @RequirePermissions('comisiones.gestionar')
  crear(@Body('service_request') dto: CreateComisionDto) { return this.service.crear(dto); }

  @Get(':id/funcionarios') @RequirePermissions('comisiones.ver')
  funcionarios(@Param('id') id: string, @Query() query: ListComisionesDto) { return this.service.funcionarios(idSeguro(id), query); }

  @Get(':id') @RequirePermissions('comisiones.ver')
  obtener(@Param('id') id: string) { return this.service.obtener(idSeguro(id)); }

  @Patch(':id') @RequirePermissions('comisiones.gestionar')
  editar(@Param('id') id: string, @Body('service_request') dto: UpdateComisionDto) { return this.service.editar(idSeguro(id), dto); }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import { DestinosService } from './destinos.service';
import { DestinosCargaService } from './destinos-carga.service';
import { archivoExcelPipe, enviarExcel } from '../../lib/carga-masiva';
import type { ArchivoSubido } from '../../lib/carga-masiva';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Auditar } from '../auditoria/decorators/auditar.decorator';
import { CreateDestinoDto } from './dto/create-destino.dto';
import { UpdateDestinoDto } from './dto/update-destino.dto';
import { ListDestinosQueryDto } from './dto/list-destinos-query.dto';
import { ListUnidadesQueryDto } from './dto/list-unidades-query.dto';
import { ListFuncionariosUnidadQueryDto } from './dto/list-funcionarios-unidad-query.dto';

@ApiTags('Destinos')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Destinos', entidad: 'Destino' })
@Controller('destinos')
export class DestinosController {
  constructor(
    private readonly destinosService: DestinosService,
    private readonly cargaService: DestinosCargaService,
  ) {}

  // ─── Unidades ──────────────────────────────────────────────────────────────
  // DEBEN ir antes de /:destinoId para que Express no las tome como un id.

  @Get('unidades')
  @ApiOperation({ summary: 'Listar unidades con su total de destinados actuales' })
  @RequirePermissions('destinos.ver')
  listarUnidades(@Query() query: ListUnidadesQueryDto) {
    return this.destinosService.listarUnidades(query);
  }

  @Get('unidades/:unidadId/funcionarios')
  @ApiOperation({ summary: 'Listar los funcionarios destinados a una unidad' })
  @RequirePermissions('destinos.ver')
  listarFuncionariosUnidad(
    @Param('unidadId', ParseIntPipe) unidadId: number,
    @Query() query: ListFuncionariosUnidadQueryDto,
  ) {
    return this.destinosService.listarFuncionariosUnidad(unidadId, query);
  }

  // ─── Carga masiva (antes de /:destinoId) ──────────────────────────────────

  @Get('carga-masiva/plantilla')
  @ApiOperation({ summary: 'Descargar plantilla Excel de destinos (con las unidades como lista desplegable)' })
  @RequirePermissions('destinos.gestionar')
  async descargarPlantilla(@Res() res: Response) {
    enviarExcel(res, await this.cargaService.generarPlantilla(), 'plantilla_destinos.xlsx');
  }

  @Post('carga-masiva')
  @ApiOperation({ summary: 'Carga masiva de destinos actuales e históricos desde Excel' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
  @RequirePermissions('destinos.gestionar')
  @Auditar({ contexto: 'Destinos', entidad: 'Carga masiva de destinos', incluirRespuesta: true })
  @UseInterceptors(FileInterceptor('archivo'))
  cargaMasiva(@UploadedFile(archivoExcelPipe()) archivo: ArchivoSubido) {
    return this.cargaService.procesarCarga(archivo.buffer);
  }

  // ─── Destinos (asignaciones) ───────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar destinos paginados con stats globales' })
  @RequirePermissions('destinos.ver')
  listarDestinos(@Query() query: ListDestinosQueryDto) {
    return this.destinosService.listarDestinos(query);
  }

  @Get(':destinoId')
  @ApiOperation({ summary: 'Obtener un destino por id' })
  @RequirePermissions('destinos.ver')
  obtenerDestino(@Param('destinoId', ParseIntPipe) destinoId: number) {
    return this.destinosService.obtenerDestino(destinoId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar un destino. Si el funcionario ya tenía uno, lo cierra (pase de destino)',
  })
  @RequirePermissions('destinos.gestionar')
  crearDestino(@Body('service_request') dto: CreateDestinoDto) {
    return this.destinosService.crearDestino(dto);
  }

  @Patch(':destinoId')
  @ApiOperation({ summary: 'Editar cargo, fechas, orden, boletín u observaciones de un destino' })
  @RequirePermissions('destinos.gestionar')
  editarDestino(
    @Param('destinoId', ParseIntPipe) destinoId: number,
    @Body('service_request') dto: UpdateDestinoDto,
  ) {
    return this.destinosService.editarDestino(destinoId, dto);
  }

  @Delete(':destinoId')
  @ApiOperation({ summary: 'Eliminar un destino del historial' })
  @RequirePermissions('destinos.gestionar')
  eliminarDestino(@Param('destinoId', ParseIntPipe) destinoId: number) {
    return this.destinosService.eliminarDestino(destinoId);
  }
}

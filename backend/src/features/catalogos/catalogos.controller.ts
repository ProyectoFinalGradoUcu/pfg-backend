import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CatalogosService } from './catalogos.service.js';
import { CatalogoUnidadesService } from './catalogo-unidades.service.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CreateComandoDto, UpdateComandoDto } from './dto/comando.dto.js';
import { CreateBaseDto, UpdateBaseDto } from './dto/base.dto.js';

@ApiTags('Catálogos')
@ApiBearerAuth()
@Auditar({ contexto: 'Catálogos', entidad: 'Unidad' })
@Controller('catalogos')
export class CatalogosController {
  constructor(
    private readonly catalogosService: CatalogosService,
    private readonly catalogoUnidades: CatalogoUnidadesService,
  ) {}

  // Unidades (comandos) y sub-unidades (bases) se comparten con liquidación:
  // baja solo lógica, el código no se edita y una base siempre pertenece a un comando.
  @ApiOperation({ summary: 'Listar unidades (los comandos)' })
  @ApiQuery({ name: 'incluir_bajas', required: false, type: Boolean })
  @Get('unidades')
  findUnidades(
    @Query('incluir_bajas', new ParseBoolPipe({ optional: true })) incluirBajas?: boolean,
  ) {
    return this.catalogosService.findUnidades(incluirBajas ?? false);
  }

  @ApiOperation({ summary: 'Crear un comando (unidad)' })
  @Post('unidades')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('catalogos.gestionar')
  @Auditar({ contexto: 'Catálogos', entidad: 'Comando', incluirRespuesta: true })
  crearComando(@Body('service_request') dto: CreateComandoDto) {
    return this.catalogoUnidades.crearComando(dto);
  }

  @ApiOperation({ summary: 'Editar la denominación de un comando, darlo de baja o reactivarlo' })
  @Patch('unidades/:unidadId')
  @RequirePermissions('catalogos.gestionar')
  @Auditar({ contexto: 'Catálogos', entidad: 'Comando' })
  editarComando(
    @Param('unidadId', ParseIntPipe) unidadId: number,
    @Body('service_request') dto: UpdateComandoDto,
  ) {
    return this.catalogoUnidades.editarComando(unidadId, dto);
  }

  @ApiOperation({ summary: 'Crear una base (sub-unidad) dentro de un comando' })
  @Post('sub-unidades')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('catalogos.gestionar')
  @Auditar({ contexto: 'Catálogos', entidad: 'Base', incluirRespuesta: true })
  crearBase(@Body('service_request') dto: CreateBaseDto) {
    return this.catalogoUnidades.crearBase(dto);
  }

  @ApiOperation({ summary: 'Editar una base, moverla de comando (si nunca se usó), darla de baja o reactivarla' })
  @Patch('sub-unidades/:subUnidadId')
  @RequirePermissions('catalogos.gestionar')
  @Auditar({ contexto: 'Catálogos', entidad: 'Base' })
  editarBase(
    @Param('subUnidadId', ParseIntPipe) subUnidadId: number,
    @Body('service_request') dto: UpdateBaseDto,
  ) {
    return this.catalogoUnidades.editarBase(subUnidadId, dto);
  }

  @ApiOperation({ summary: 'Listar situaciones (estados)' })
  @Get('situaciones')
  findSituaciones() {
    return this.catalogosService.findSituaciones();
  }

  @ApiOperation({
    summary: 'Listar motivos de baja vigentes',
    description: 'Alimenta el motivo_baja_id obligatorio al registrar un retiro.',
  })
  @Get('motivos-baja')
  findMotivosBaja() {
    return this.catalogosService.findMotivosBaja();
  }

  @ApiOperation({ summary: 'Listar escalafones' })
  @Get('escalafones')
  findEscalafones() {
    return this.catalogosService.findEscalafones();
  }

  @ApiOperation({ summary: 'Listar grados, opcionalmente filtrados por escalafón' })
  @ApiQuery({ name: 'escalafon_id', required: false, type: Number })
  @Get('grados')
  findGrados(@Query('escalafon_id', new ParseIntPipe({ optional: true })) escalafon_id?: number) {
    return this.catalogosService.findGrados(escalafon_id);
  }

  @ApiOperation({ summary: 'Listar regímenes' })
  @Get('regimenes')
  findRegimenes() {
    return this.catalogosService.findRegimenes();
  }

  @ApiOperation({ summary: 'Listar programas' })
  @Get('programas')
  findProgramas() {
    return this.catalogosService.findProgramas();
  }

  @ApiOperation({ summary: 'Listar sub-unidades' })
  @Get('sub-unidades')
  findSubUnidades() {
    return this.catalogosService.findSubUnidades();
  }
}

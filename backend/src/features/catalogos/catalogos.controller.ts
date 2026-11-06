import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CatalogosService } from './catalogos.service.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';

@ApiTags('Catálogos')
@ApiBearerAuth()
@Auditar({ contexto: 'Catálogos', entidad: 'Unidad' })
@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  // Unidades y sub-unidades son catálogos de liquidación: solo lectura.
  @ApiOperation({ summary: 'Listar unidades (los comandos de liquidación)' })
  @Get('unidades')
  findUnidades() {
    return this.catalogosService.findUnidades();
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

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
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CatalogosService } from './catalogos.service.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';
import { CreateUnidadDto } from './dto/create-unidad.dto.js';
import { UpdateUnidadDto } from './dto/update-unidad.dto.js';

@ApiTags('Catálogos')
@ApiBearerAuth()
@Auditar({ contexto: 'Catálogos', entidad: 'Unidad' })
@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  @ApiOperation({ summary: 'Listar unidades (destinos)' })
  @Get('unidades')
  findUnidades() {
    return this.catalogosService.findUnidades();
  }

  @ApiOperation({ summary: 'Crear una unidad' })
  @Post('unidades')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('catalogos.gestionar')
  crearUnidad(@Body('service_request') dto: CreateUnidadDto) {
    return this.catalogosService.crearUnidad(dto);
  }

  @ApiOperation({ summary: 'Editar denominación, tipo o vigencia de una unidad' })
  @Patch('unidades/:unidadId')
  @RequirePermissions('catalogos.gestionar')
  editarUnidad(
    @Param('unidadId', ParseIntPipe) unidadId: number,
    @Body('service_request') dto: UpdateUnidadDto,
  ) {
    return this.catalogosService.editarUnidad(unidadId, dto);
  }

  @ApiOperation({
    summary: 'Dar de baja una unidad (baja lógica: vigente = false, no se borra la fila)',
  })
  @Delete('unidades/:unidadId')
  @RequirePermissions('catalogos.gestionar')
  darDeBajaUnidad(@Param('unidadId', ParseIntPipe) unidadId: number) {
    return this.catalogosService.darDeBajaUnidad(unidadId);
  }

  @ApiOperation({ summary: 'Listar situaciones (estados)' })
  @Get('situaciones')
  findSituaciones() {
    return this.catalogosService.findSituaciones();
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

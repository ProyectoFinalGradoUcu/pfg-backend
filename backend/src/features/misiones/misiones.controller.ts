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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { MisionesService } from './misiones.service';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Auditar } from '../auditoria/decorators/auditar.decorator';
import { CreateMisionDto } from './dto/create-mision.dto';
import { UpdateMisionDto } from './dto/update-mision.dto';
import { ListMisionesQueryDto } from './dto/list-misiones-query.dto';
import { CreateConvocatoriaDto } from './dto/create-convocatoria.dto';
import { UpdateConvocatoriaDto } from './dto/update-convocatoria.dto';
import { ListConvocatoriasQueryDto } from './dto/list-convocatorias-query.dto';
import { AddFuncionariosConvocatoriaDto } from './dto/add-funcionarios-convocatoria.dto';
import { UpdateFuncionarioConvocatoriaDto } from './dto/update-funcionario-convocatoria.dto';
import { ListFuncionariosConvocatoriaQueryDto } from './dto/list-funcionarios-convocatoria-query.dto';
import { ListPersonalMisionQueryDto } from './dto/list-personal-mision-query.dto';

@ApiTags('Misiones')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Misiones', entidad: 'Misión' })
@Controller('misiones')
export class MisionesController {
  constructor(private readonly misionesService: MisionesService) {}

  // ─── Personal en misión (listado global plano) ─────────────────────────────
  // DEBE ir antes de /:misionId para que Express no lo confunda con un parámetro.

  @Get('funcionarios')
  @ApiOperation({ summary: 'Listado plano de todo el personal en misión' })
  @RequirePermissions('misiones.ver')
  listarPersonalEnMision(@Query() query: ListPersonalMisionQueryDto) {
    return this.misionesService.listarPersonalEnMision(query);
  }

  // ─── Misiones (catálogo) ───────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar misiones paginadas con stats globales' })
  @RequirePermissions('misiones.ver')
  listarMisiones(@Query() query: ListMisionesQueryDto) {
    return this.misionesService.listarMisiones(query);
  }

  @Get(':misionId')
  @ApiOperation({ summary: 'Obtener una misión por id' })
  @RequirePermissions('misiones.ver')
  obtenerMision(@Param('misionId', ParseIntPipe) misionId: number) {
    return this.misionesService.obtenerMision(misionId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear misión en el catálogo' })
  @RequirePermissions('misiones.gestionar')
  crearMision(@Body('service_request') dto: CreateMisionDto) {
    return this.misionesService.crearMision(dto);
  }

  @Patch(':misionId')
  @ApiOperation({ summary: 'Editar nombre o país de una misión' })
  @RequirePermissions('misiones.gestionar')
  editarMision(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Body('service_request') dto: UpdateMisionDto,
  ) {
    return this.misionesService.editarMision(misionId, dto);
  }

  @Delete(':misionId')
  @ApiOperation({ summary: 'Eliminar una misión y todas sus convocatorias' })
  @RequirePermissions('misiones.gestionar')
  eliminarMision(@Param('misionId', ParseIntPipe) misionId: number) {
    return this.misionesService.eliminarMision(misionId);
  }

  // ─── Convocatorias ─────────────────────────────────────────────────────────

  @Get(':misionId/convocatorias')
  @ApiOperation({ summary: 'Listar convocatorias de una misión' })
  @RequirePermissions('misiones.ver')
  listarConvocatorias(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Query() query: ListConvocatoriasQueryDto,
  ) {
    return this.misionesService.listarConvocatorias(misionId, query);
  }

  @Get(':misionId/convocatorias/:convocatoriaId')
  @ApiOperation({ summary: 'Obtener una convocatoria por id' })
  @RequirePermissions('misiones.ver')
  obtenerConvocatoria(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Param('convocatoriaId', ParseIntPipe) convocatoriaId: number,
  ) {
    return this.misionesService.obtenerConvocatoria(misionId, convocatoriaId);
  }

  @Post(':misionId/convocatorias')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear convocatoria (con asignación opcional de personas)' })
  @RequirePermissions('misiones.gestionar')
  crearConvocatoria(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Body('service_request') dto: CreateConvocatoriaDto,
  ) {
    return this.misionesService.crearConvocatoria(misionId, dto);
  }

  @Patch(':misionId/convocatorias/:convocatoriaId')
  @ApiOperation({ summary: 'Editar campos de una convocatoria' })
  @RequirePermissions('misiones.gestionar')
  editarConvocatoria(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Param('convocatoriaId', ParseIntPipe) convocatoriaId: number,
    @Body('service_request') dto: UpdateConvocatoriaDto,
  ) {
    return this.misionesService.editarConvocatoria(misionId, convocatoriaId, dto);
  }

  @Delete(':misionId/convocatorias/:convocatoriaId')
  @ApiOperation({ summary: 'Eliminar una convocatoria y sus asignaciones' })
  @RequirePermissions('misiones.gestionar')
  eliminarConvocatoria(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Param('convocatoriaId', ParseIntPipe) convocatoriaId: number,
  ) {
    return this.misionesService.eliminarConvocatoria(misionId, convocatoriaId);
  }

  // ─── Funcionarios de una convocatoria ─────────────────────────────────────

  @Get(':misionId/convocatorias/:convocatoriaId/funcionarios')
  @ApiOperation({ summary: 'Listar funcionarios asignados a una convocatoria' })
  @RequirePermissions('misiones.ver')
  listarFuncionariosConvocatoria(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Param('convocatoriaId', ParseIntPipe) convocatoriaId: number,
    @Query() query: ListFuncionariosConvocatoriaQueryDto,
  ) {
    return this.misionesService.listarFuncionariosConvocatoria(misionId, convocatoriaId, query);
  }

  @Post(':misionId/convocatorias/:convocatoriaId/funcionarios')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar funcionarios a una convocatoria' })
  @RequirePermissions('misiones.gestionar')
  agregarFuncionarios(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Param('convocatoriaId', ParseIntPipe) convocatoriaId: number,
    @Body('service_request') dto: AddFuncionariosConvocatoriaDto,
  ) {
    return this.misionesService.agregarFuncionarios(misionId, convocatoriaId, dto);
  }

  @Patch(':misionId/convocatorias/:convocatoriaId/funcionarios/:personaId')
  @ApiOperation({ summary: 'Actualizar orden/boletín/observaciones de un funcionario en la convocatoria' })
  @RequirePermissions('misiones.gestionar')
  editarFuncionarioConvocatoria(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Param('convocatoriaId', ParseIntPipe) convocatoriaId: number,
    @Param('personaId', ParseIntPipe) personaId: number,
    @Body('service_request') dto: UpdateFuncionarioConvocatoriaDto,
  ) {
    return this.misionesService.editarFuncionarioConvocatoria(misionId, convocatoriaId, personaId, dto);
  }

  @Delete(':misionId/convocatorias/:convocatoriaId/funcionarios/:personaId')
  @ApiOperation({ summary: 'Quitar un funcionario de la convocatoria' })
  @RequirePermissions('misiones.gestionar')
  quitarFuncionario(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Param('convocatoriaId', ParseIntPipe) convocatoriaId: number,
    @Param('personaId', ParseIntPipe) personaId: number,
  ) {
    return this.misionesService.quitarFuncionario(misionId, convocatoriaId, personaId);
  }

  @Delete(':misionId/convocatorias/:convocatoriaId/funcionarios')
  @ApiOperation({ summary: 'Quitar todos los funcionarios de una convocatoria' })
  @RequirePermissions('misiones.gestionar')
  quitarTodosFuncionarios(
    @Param('misionId', ParseIntPipe) misionId: number,
    @Param('convocatoriaId', ParseIntPipe) convocatoriaId: number,
  ) {
    return this.misionesService.quitarTodosFuncionarios(misionId, convocatoriaId);
  }
}

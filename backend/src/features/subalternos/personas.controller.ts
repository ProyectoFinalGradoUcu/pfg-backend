import {
  Controller, Get, Post, Patch, Query, Body, Param, ParseIntPipe, Res,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiConsumes, ApiBody, ApiParam } from '@nestjs/swagger';
import type { Response } from 'express';
import { SubalternosService } from './subalternos.service.js';
import { PersonasCargaService } from './personas-carga.service.js';
import { PersonalPerfilService } from './personal-perfil.service.js';
import { ListPersonasQueryDto } from './dto/list-personas-query.dto.js';
import { CreatePersonalDto } from './dto/create-personal.dto.js';
import { UpdatePersonalDto } from './dto/update-personal.dto.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator.js';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';

@ApiTags('Personas')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Personas', entidad: 'Persona' })
@Controller('personas')
export class PersonasController {
  constructor(
    private readonly subalternosService: SubalternosService,
    private readonly cargaService: PersonasCargaService,
    private readonly perfilService: PersonalPerfilService,
  ) {}

  // ─── Listado ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Listado paginado de personal' })
  @RequireAlcance('personas.ver')
  @Get()
  findAll(
    @Query() query: ListPersonasQueryDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.subalternosService.findAllPersonas(query, alcance);
  }

  // ─── Carga masiva ─────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Descargar plantilla Excel para carga masiva' })
  @RequireAlcance('personas.crear')
  @Get('plantilla')
  descargarPlantilla(@Res() res: Response) {
    const buffer = this.cargaService.generarPlantilla();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_carga_personal.xlsx"');
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Carga masiva de personal desde Excel' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
  @RequireAlcance('personas.crear')
  @Post('carga-masiva')
  @UseInterceptors(FileInterceptor('archivo'))
  cargaMasiva(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        ],
      }),
    )
    archivo: { buffer: Buffer; mimetype: string; originalname: string },
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cargaService.procesarCarga(archivo.buffer, alcance);
  }

  // ─── Crear ────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Crear personal' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400 })
  @ApiResponse({ status: 409, description: 'Cédula duplicada.' })
  @RequireAlcance('personas.crear')
  @Auditar({ contexto: 'Personas', entidad: 'Persona', incluirRespuesta: true })
  @Post()
  create(@Body() dto: CreatePersonalDto, @Alcance() alcance: AlcanceResuelto) {
    return this.subalternosService.createPersonal(dto, alcance);
  }

  // ─── Detalle ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Datos personales + relación laboral activa (tab Datos Personales)' })
  @ApiParam({ name: 'id', type: Number })
  @RequireAlcance('personas.ver')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.perfilService.findOne(id, alcance);
  }

  @ApiOperation({ summary: 'Familiares militares vinculados (tab Información Familiar)' })
  @ApiParam({ name: 'id', type: Number })
  @RequireAlcance('personas.ver')
  @Get(':id/familiares')
  findFamiliares(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.perfilService.findFamiliares(id, alcance);
  }

  @ApiOperation({ summary: 'Historial de rangos / ascensos (tab Historial Militar)' })
  @ApiParam({ name: 'id', type: Number })
  @RequireAlcance('personas.ver')
  @Get(':id/historial-militar')
  findHistorialMilitar(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.perfilService.findHistorialMilitar(id, alcance);
  }

  @ApiOperation({ summary: 'Cursos realizados (tab Cursos)' })
  @ApiParam({ name: 'id', type: Number })
  @RequireAlcance('personas.ver')
  @Get(':id/cursos')
  findCursos(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.perfilService.findCursos(id, alcance);
  }

  @ApiOperation({ summary: 'Misiones internacionales (tab Misiones)' })
  @ApiParam({ name: 'id', type: Number })
  @RequireAlcance('personas.ver')
  @Get(':id/misiones')
  findMisiones(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.perfilService.findMisiones(id, alcance);
  }

  @ApiOperation({ summary: 'Historial de destinos (tab Destinos)' })
  @ApiParam({ name: 'id', type: Number })
  @RequirePermissions('personas.ver')
  @Get(':id/destinos')
  findDestinos(@Param('id', ParseIntPipe) id: number) {
    return this.perfilService.findDestinos(id);
  }

  // ─── Editar ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Editar datos personales y/o laborales' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Devuelve el perfil actualizado completo.' })
  @RequireAlcance('personas.editar')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePersonalDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.perfilService.update(id, dto, alcance);
  }
}

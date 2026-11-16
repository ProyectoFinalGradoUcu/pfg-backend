import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DesignacionesDocumentosService } from './designaciones-documentos.service';
import { AdjuntarDesignacionesDto } from './dto/adjuntar-designaciones.dto';
import { SLOTS_DOCUMENTO, type SlotDocumento } from '../archivos/documentos-de-registro';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';
import {
  SubidaDeArchivo,
  escribirEncabezados,
  streamArchivo,
  validadorDeArchivo,
} from '../archivos/archivos.http';

const slotPipe = new ParseEnumPipe(SLOTS_DOCUMENTO);

// `:id` y no `:designacionId`: la auditoría toma params.id como entidad_id.
@ApiTags('Cursos')
@ApiCookieAuth('auth_token')
@ApiParam({ name: 'cursoId', type: Number })
@ApiParam({ name: 'slot', enum: Object.values(SLOTS_DOCUMENTO) })
@Auditar({ contexto: 'Cursos', entidad: 'Documento de designación' })
@Controller('cursos/:cursoId/designaciones')
export class DesignacionesDocumentosController {
  constructor(private readonly documentos: DesignacionesDocumentosService) {}

  @ApiOperation({
    summary: 'Adjuntar el mismo documento a varias designaciones del curso (PDF, JPG o PNG — máx 10 MB)',
    description: 'Guarda una copia por designación. Responde cuántas quedaron adjuntadas: las que ya tenían documento en ese slot se saltean.',
  })
  @ApiResponse({ status: 400, description: 'Falta el archivo, tipo o contenido inválido, slot inválido o designacion_ids mal formado.' })
  @ApiResponse({ status: 404, description: 'El curso no es gestionable o alguna designación no es del curso.' })
  @ApiResponse({ status: 413, description: 'El archivo supera los 10 MB.' })
  @RequireAlcance('cursos.gestionar')
  @SubidaDeArchivo('archivo', { designacion_ids: { type: 'string' } })
  @Post('documentos/:slot')
  async adjuntarAVarias(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @UploadedFile(validadorDeArchivo()) archivo: Express.Multer.File,
    @Body() dto: AdjuntarDesignacionesDto,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ): Promise<{ adjuntados: number }> {
    const ids = dto.designacion_ids.split(',').map((id) => BigInt(id));
    await this.documentos.verificarGestionar(BigInt(cursoId), ids, alcance);
    return this.documentos.subirAVarios(ids, slot, archivo, BigInt(user.id));
  }

  @ApiOperation({ summary: 'Adjuntar el documento de la orden o del boletín (PDF, JPG o PNG — máx 10 MB)' })
  @ApiResponse({ status: 400, description: 'Falta el archivo, tipo o contenido inválido, o slot inválido.' })
  @ApiResponse({ status: 404, description: 'Designación no encontrada.' })
  @ApiResponse({ status: 409, description: 'La designación ya tiene documento en ese slot.' })
  @ApiResponse({ status: 413, description: 'El archivo supera los 10 MB.' })
  @RequireAlcance('cursos.gestionar')
  @SubidaDeArchivo('archivo')
  @Post(':id/documentos/:slot')
  async subir(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @UploadedFile(validadorDeArchivo()) archivo: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    await this.documentos.verificarGestionar(BigInt(cursoId), [BigInt(id)], alcance);
    return this.documentos.subir(BigInt(id), slot, archivo, BigInt(user.id));
  }

  // Antes del GET: sin ruta HEAD propia, Express usa el GET y baja el objeto de MinIO.
  @ApiOperation({ summary: 'Headers del documento (nombre, tipo, tamaño) sin el contenido' })
  @ApiResponse({ status: 404, description: 'La designación no existe o no tiene documento en ese slot.' })
  @RequireAlcance('cursos.ver')
  @Head(':id/documentos/:slot')
  async encabezados(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @Res() res: Response,
    @Alcance() alcance: AlcanceResuelto,
  ): Promise<void> {
    await this.documentos.verificarVer(BigInt(cursoId), BigInt(id), alcance);
    escribirEncabezados(res, await this.documentos.metadatos(BigInt(id), slot));
    res.status(200).end();
  }

  @ApiOperation({ summary: 'Ver o descargar el documento de la orden o del boletín' })
  @ApiQuery({
    name: 'download',
    required: false,
    description: '1 para forzar la descarga (attachment) en vez de mostrarlo',
  })
  @ApiResponse({ status: 404, description: 'La designación no existe o no tiene documento en ese slot.' })
  @RequireAlcance('cursos.ver')
  @Get(':id/documentos/:slot')
  async descargar(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @Res({ passthrough: true }) res: Response,
    @Alcance() alcance: AlcanceResuelto,
    @Query('download') download?: string,
  ): Promise<StreamableFile> {
    await this.documentos.verificarVer(BigInt(cursoId), BigInt(id), alcance);
    const archivo = await this.documentos.obtener(BigInt(id), slot);
    return streamArchivo(res, archivo, { descarga: download === '1' || download === 'true' });
  }

  @ApiOperation({ summary: 'Quitar el documento de la orden o del boletín' })
  @ApiResponse({ status: 404, description: 'La designación no existe o no tiene documento en ese slot.' })
  @RequireAlcance('cursos.gestionar')
  @HttpCode(HttpStatus.OK)
  @Delete(':id/documentos/:slot')
  async quitar(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    await this.documentos.verificarGestionar(BigInt(cursoId), [BigInt(id)], alcance);
    return this.documentos.quitar(BigInt(id), slot, BigInt(user.id));
  }
}

import {
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
import {
  AsignacionesMisionDocumentosService,
  ConvocatoriasDocumentosService,
} from './misiones-documentos.service';
import { SLOTS_DOCUMENTO, type SlotDocumento } from '../archivos/documentos-de-registro';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';
import {
  SubidaDeArchivo,
  escribirEncabezados,
  streamArchivo,
  validadorDeArchivo,
} from '../archivos/archivos.http';

const slotPipe = new ParseEnumPipe(SLOTS_DOCUMENTO);

// `:id` y no `:convocatoriaId`: la auditoría toma params.id como entidad_id.
@ApiTags('Misiones')
@ApiCookieAuth('auth_token')
@ApiParam({ name: 'id', type: Number })
@ApiParam({ name: 'slot', enum: Object.values(SLOTS_DOCUMENTO) })
@Auditar({ contexto: 'Misiones', entidad: 'Documento de convocatoria' })
@Controller('misiones/convocatorias/:id/documentos')
export class ConvocatoriasDocumentosController {
  constructor(private readonly documentos: ConvocatoriasDocumentosService) {}

  @ApiOperation({ summary: 'Adjuntar el documento de la orden o del boletín (PDF, JPG o PNG — máx 10 MB)' })
  @ApiResponse({ status: 400, description: 'Falta el archivo, tipo o contenido inválido, o slot inválido.' })
  @ApiResponse({ status: 404, description: 'Convocatoria no encontrada.' })
  @ApiResponse({ status: 409, description: 'La convocatoria ya tiene documento en ese slot.' })
  @ApiResponse({ status: 413, description: 'El archivo supera los 10 MB.' })
  @RequirePermissions('misiones.gestionar')
  @SubidaDeArchivo('archivo')
  @Post(':slot')
  subir(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @UploadedFile(validadorDeArchivo()) archivo: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentos.subir(BigInt(id), slot, archivo, BigInt(user.id));
  }

  // Antes del GET: sin ruta HEAD propia, Express usa el GET y baja el objeto de MinIO.
  @ApiOperation({ summary: 'Headers del documento (nombre, tipo, tamaño) sin el contenido' })
  @ApiResponse({ status: 404, description: 'La convocatoria no existe o no tiene documento en ese slot.' })
  @RequirePermissions('misiones.ver')
  @Head(':slot')
  async encabezados(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @Res() res: Response,
  ): Promise<void> {
    escribirEncabezados(res, await this.documentos.metadatos(BigInt(id), slot));
    res.status(200).end();
  }

  @ApiOperation({ summary: 'Ver o descargar el documento de la orden o del boletín' })
  @ApiQuery({
    name: 'download',
    required: false,
    description: '1 para forzar la descarga (attachment) en vez de mostrarlo',
  })
  @ApiResponse({ status: 404, description: 'La convocatoria no existe o no tiene documento en ese slot.' })
  @RequirePermissions('misiones.ver')
  @Get(':slot')
  async descargar(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @Res({ passthrough: true }) res: Response,
    @Query('download') download?: string,
  ): Promise<StreamableFile> {
    const archivo = await this.documentos.obtener(BigInt(id), slot);
    return streamArchivo(res, archivo, { descarga: download === '1' || download === 'true' });
  }

  @ApiOperation({ summary: 'Quitar el documento de la orden o del boletín' })
  @ApiResponse({ status: 404, description: 'La convocatoria no existe o no tiene documento en ese slot.' })
  @RequirePermissions('misiones.gestionar')
  @HttpCode(HttpStatus.OK)
  @Delete(':slot')
  quitar(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentos.quitar(BigInt(id), slot, BigInt(user.id));
  }
}

@ApiTags('Misiones')
@ApiCookieAuth('auth_token')
@ApiParam({ name: 'id', type: Number })
@ApiParam({ name: 'slot', enum: Object.values(SLOTS_DOCUMENTO) })
@Auditar({ contexto: 'Misiones', entidad: 'Documento de asignación a misión' })
@Controller('misiones/asignaciones/:id/documentos')
export class AsignacionesMisionDocumentosController {
  constructor(private readonly documentos: AsignacionesMisionDocumentosService) {}

  @ApiOperation({ summary: 'Adjuntar el documento de la orden o del boletín (PDF, JPG o PNG — máx 10 MB)' })
  @ApiResponse({ status: 400, description: 'Falta el archivo, tipo o contenido inválido, o slot inválido.' })
  @ApiResponse({ status: 404, description: 'Asignación no encontrada.' })
  @ApiResponse({ status: 409, description: 'La asignación ya tiene documento en ese slot.' })
  @ApiResponse({ status: 413, description: 'El archivo supera los 10 MB.' })
  @RequirePermissions('misiones.gestionar')
  @SubidaDeArchivo('archivo')
  @Post(':slot')
  subir(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @UploadedFile(validadorDeArchivo()) archivo: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentos.subir(BigInt(id), slot, archivo, BigInt(user.id));
  }

  // Antes del GET: sin ruta HEAD propia, Express usa el GET y baja el objeto de MinIO.
  @ApiOperation({ summary: 'Headers del documento (nombre, tipo, tamaño) sin el contenido' })
  @ApiResponse({ status: 404, description: 'La asignación no existe o no tiene documento en ese slot.' })
  @RequirePermissions('misiones.ver')
  @Head(':slot')
  async encabezados(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @Res() res: Response,
  ): Promise<void> {
    escribirEncabezados(res, await this.documentos.metadatos(BigInt(id), slot));
    res.status(200).end();
  }

  @ApiOperation({ summary: 'Ver o descargar el documento de la orden o del boletín' })
  @ApiQuery({
    name: 'download',
    required: false,
    description: '1 para forzar la descarga (attachment) en vez de mostrarlo',
  })
  @ApiResponse({ status: 404, description: 'La asignación no existe o no tiene documento en ese slot.' })
  @RequirePermissions('misiones.ver')
  @Get(':slot')
  async descargar(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @Res({ passthrough: true }) res: Response,
    @Query('download') download?: string,
  ): Promise<StreamableFile> {
    const archivo = await this.documentos.obtener(BigInt(id), slot);
    return streamArchivo(res, archivo, { descarga: download === '1' || download === 'true' });
  }

  @ApiOperation({ summary: 'Quitar el documento de la orden o del boletín' })
  @ApiResponse({ status: 404, description: 'La asignación no existe o no tiene documento en ese slot.' })
  @RequirePermissions('misiones.gestionar')
  @HttpCode(HttpStatus.OK)
  @Delete(':slot')
  quitar(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentos.quitar(BigInt(id), slot, BigInt(user.id));
  }
}

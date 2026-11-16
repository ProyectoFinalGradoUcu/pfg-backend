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
  RetirosDocumentosService,
  SLOTS_DOCUMENTO_RETIRO,
  type SlotDocumentoRetiro,
} from './retiros-documentos.service';
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

const slotPipe = new ParseEnumPipe(SLOTS_DOCUMENTO_RETIRO);

// `:id` y no `:retiroId`: la auditoría toma params.id como entidad_id.
@ApiTags('Retiros')
@ApiCookieAuth('auth_token')
@ApiParam({ name: 'id', type: Number })
@ApiParam({ name: 'slot', enum: Object.values(SLOTS_DOCUMENTO_RETIRO) })
@Auditar({ contexto: 'Retiros', entidad: 'Documento de retiro' })
@Controller('retiros/:id/documentos')
export class RetirosDocumentosController {
  constructor(private readonly documentos: RetirosDocumentosService) {}

  @ApiOperation({ summary: 'Adjuntar el documento de la orden o del boletín (PDF, JPG o PNG — máx 10 MB)' })
  @ApiResponse({ status: 400, description: 'Falta el archivo, tipo o contenido inválido, o slot inválido.' })
  @ApiResponse({ status: 404, description: 'Retiro no encontrado.' })
  @ApiResponse({ status: 409, description: 'El retiro está anulado o ya tiene documento en ese slot.' })
  @ApiResponse({ status: 413, description: 'El archivo supera los 10 MB.' })
  @RequirePermissions('retiros.registrar')
  @SubidaDeArchivo('archivo')
  @Post(':slot')
  subir(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumentoRetiro,
    @UploadedFile(validadorDeArchivo()) archivo: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentos.subir(id, slot, archivo, BigInt(user.id));
  }

  // Antes del GET: sin ruta HEAD propia, Express usa el GET y baja el objeto de MinIO.
  @ApiOperation({ summary: 'Headers del documento (nombre, tipo, tamaño) sin el contenido' })
  @ApiResponse({ status: 404, description: 'El retiro no existe o no tiene documento en ese slot.' })
  @RequirePermissions('retiros.ver')
  @Head(':slot')
  async encabezados(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumentoRetiro,
    @Res() res: Response,
  ): Promise<void> {
    escribirEncabezados(res, await this.documentos.metadatos(id, slot));
    res.status(200).end();
  }

  @ApiOperation({ summary: 'Ver o descargar el documento de la orden o del boletín' })
  @ApiQuery({
    name: 'download',
    required: false,
    description: '1 para forzar la descarga (attachment) en vez de mostrarlo',
  })
  @ApiResponse({ status: 404, description: 'El retiro no existe o no tiene documento en ese slot.' })
  @RequirePermissions('retiros.ver')
  @Get(':slot')
  async descargar(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumentoRetiro,
    @Res({ passthrough: true }) res: Response,
    @Query('download') download?: string,
  ): Promise<StreamableFile> {
    const archivo = await this.documentos.obtener(id, slot);
    return streamArchivo(res, archivo, { descarga: download === '1' || download === 'true' });
  }

  @ApiOperation({ summary: 'Quitar el documento de la orden o del boletín' })
  @ApiResponse({ status: 404, description: 'El retiro no existe o no tiene documento en ese slot.' })
  @ApiResponse({ status: 409, description: 'El retiro está anulado.' })
  @RequirePermissions('retiros.registrar')
  @HttpCode(HttpStatus.OK)
  @Delete(':slot')
  quitar(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumentoRetiro,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentos.quitar(id, slot, BigInt(user.id));
  }
}

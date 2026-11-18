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
import { OrdenesDocumentosService } from './ordenes-documentos.service.js';
import { OrdenesAscensoService } from './ordenes-ascenso.service.js';
import { SLOTS_DOCUMENTO, type SlotDocumento } from '../archivos/documentos-de-registro.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator.js';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';
import {
  SubidaDeArchivo,
  escribirEncabezados,
  streamArchivo,
  validadorDeArchivo,
} from '../archivos/archivos.http.js';

const slotPipe = new ParseEnumPipe(SLOTS_DOCUMENTO);

// `:id` y no `:ordenId`: la auditoría toma params.id como entidad_id.
@ApiTags('Ascensos')
@ApiCookieAuth('auth_token')
@ApiParam({ name: 'id', type: Number })
@ApiParam({ name: 'slot', enum: Object.values(SLOTS_DOCUMENTO) })
@Auditar({ contexto: 'Ascensos', entidad: 'Documento de orden de ascenso' })
@Controller('ascensos/ordenes/:id/documentos')
export class OrdenesDocumentosController {
  constructor(
    private readonly documentos: OrdenesDocumentosService,
    private readonly ordenes: OrdenesAscensoService,
  ) {}

  @ApiOperation({ summary: 'Adjuntar el documento de la orden o de la resolución (PDF, JPG o PNG — máx 10 MB)' })
  @ApiResponse({ status: 400, description: 'Falta el archivo, tipo o contenido inválido, o slot inválido.' })
  @ApiResponse({ status: 403, description: 'La orden incluye funcionarios fuera del alcance.' })
  @ApiResponse({ status: 404, description: 'Orden de ascenso no encontrada.' })
  @ApiResponse({ status: 409, description: 'La orden está anulada o ya tiene documento en ese slot.' })
  @ApiResponse({ status: 413, description: 'El archivo supera los 10 MB.' })
  @RequirePermissions('ascensos.registrar')
  @RequireAlcance('ascensos.ver')
  @SubidaDeArchivo('archivo')
  @Post(':slot')
  async subir(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @UploadedFile(validadorDeArchivo()) archivo: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    await this.ordenes.verificarAlcanceOrden(id, alcance, 'gestionar');
    return this.documentos.subir(BigInt(id), slot, archivo, BigInt(user.id));
  }

  // Antes del GET: sin ruta HEAD propia, Express usa el GET y baja el objeto de MinIO.
  @ApiOperation({ summary: 'Headers del documento (nombre, tipo, tamaño) sin el contenido' })
  @ApiResponse({ status: 404, description: 'La orden no existe o no tiene documento en ese slot.' })
  @RequireAlcance('ascensos.ver')
  @Head(':slot')
  async encabezados(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @Res() res: Response,
    @Alcance() alcance: AlcanceResuelto,
  ): Promise<void> {
    await this.ordenes.verificarAlcanceOrden(id, alcance, 'ver');
    escribirEncabezados(res, await this.documentos.metadatos(BigInt(id), slot));
    res.status(200).end();
  }

  @ApiOperation({ summary: 'Ver o descargar el documento de la orden o de la resolución' })
  @ApiQuery({
    name: 'download',
    required: false,
    description: '1 para forzar la descarga (attachment) en vez de mostrarlo',
  })
  @ApiResponse({ status: 404, description: 'La orden no existe o no tiene documento en ese slot.' })
  @RequireAlcance('ascensos.ver')
  @Get(':slot')
  async descargar(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @Res({ passthrough: true }) res: Response,
    @Alcance() alcance: AlcanceResuelto,
    @Query('download') download?: string,
  ): Promise<StreamableFile> {
    await this.ordenes.verificarAlcanceOrden(id, alcance, 'ver');
    const archivo = await this.documentos.obtener(BigInt(id), slot);
    return streamArchivo(res, archivo, { descarga: download === '1' || download === 'true' });
  }

  @ApiOperation({ summary: 'Quitar el documento de la orden o de la resolución' })
  @ApiResponse({ status: 403, description: 'La orden incluye funcionarios fuera del alcance.' })
  @ApiResponse({ status: 404, description: 'La orden no existe o no tiene documento en ese slot.' })
  @ApiResponse({ status: 409, description: 'La orden está anulada.' })
  @RequirePermissions('ascensos.registrar')
  @RequireAlcance('ascensos.ver')
  @HttpCode(HttpStatus.OK)
  @Delete(':slot')
  async quitar(
    @Param('id', ParseIntPipe) id: number,
    @Param('slot', slotPipe) slot: SlotDocumento,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    await this.ordenes.verificarAlcanceOrden(id, alcance, 'gestionar');
    return this.documentos.quitar(BigInt(id), slot, BigInt(user.id));
  }
}

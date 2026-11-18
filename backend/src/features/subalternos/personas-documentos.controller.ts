import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PersonasDocumentosService } from './personas-documentos.service.js';
import { PersonaAccesibleGuard } from './persona-accesible.js';
import {
  ActualizarDocumentoDto,
  DocumentoPersonalDto,
  SubirDocumentoDto,
} from './dto/documento-personal.dto.js';
import {
  escribirEncabezados,
  SubidaDeArchivo,
  streamArchivo,
  validadorDeArchivo,
} from '../archivos/archivos.http.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator.js';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';

const esVerdadero = (valor?: string) => valor === '1' || valor === 'true';

/**
 * El documento se identifica con `:id` y no `:documentoId` porque el interceptor de
 * auditoría toma `params.id` como `entidad_id`: así la bitácora guarda el id del documento.
 *
 * `PersonaAccesibleGuard` corre antes que multer y que los pipes: un funcionario
 * inexistente o fuera de alcance da 404 antes de leer o validar el archivo.
 */
@ApiTags('Personas')
@ApiCookieAuth('auth_token')
@ApiParam({ name: 'personaId', type: Number })
@Auditar({ contexto: 'Personas', entidad: 'Documento de personal' })
@UseGuards(PersonaAccesibleGuard)
@Controller('personas/:personaId/documentos')
export class PersonasDocumentosController {
  constructor(private readonly documentos: PersonasDocumentosService) {}

  @ApiOperation({ summary: 'Documentos de un funcionario, más recientes primero' })
  @ApiResponse({ status: 200, type: DocumentoPersonalDto, isArray: true })
  @RequireAlcance('personas.ver')
  @Get()
  listar(
    @Param('personaId', ParseIntPipe) personaId: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.documentos.listar(personaId, alcance);
  }

  @ApiOperation({ summary: 'Subir un documento del funcionario (PDF, JPG o PNG — máx 10 MB)' })
  @ApiResponse({ status: 201, type: DocumentoPersonalDto })
  @ApiResponse({ status: 400, description: 'Falta el archivo, o tipo o contenido inválido.' })
  @ApiResponse({ status: 404, description: 'El funcionario no existe o está fuera de alcance.' })
  @ApiResponse({
    status: 409,
    description: 'Ya hay un documento con el mismo contenido, nombre o descripción.',
  })
  @ApiResponse({ status: 413, description: 'El archivo supera los 10 MB.' })
  @RequireAlcance('personas.editar')
  @Auditar({ contexto: 'Personas', entidad: 'Documento de personal', incluirRespuesta: true })
  @SubidaDeArchivo('archivo', { descripcion: { type: 'string', maxLength: 200 } })
  @Post()
  subir(
    @Param('personaId', ParseIntPipe) personaId: number,
    @UploadedFile(validadorDeArchivo()) archivo: Express.Multer.File,
    @Body() dto: SubirDocumentoDto,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.documentos.subir(personaId, archivo, dto, BigInt(user.id), alcance);
  }

  /**
   * Declarado ANTES que el `GET :id`: Express resuelve un HEAD con el primer GET que
   * coincida si no encontró antes una ruta HEAD, y ese GET bajaría el objeto de MinIO.
   */
  @ApiOperation({ summary: 'Headers del documento (nombre, tipo, tamaño) sin el contenido' })
  @ApiParam({ name: 'id', type: Number })
  @RequireAlcance('personas.ver')
  @Head(':id')
  async encabezados(
    @Param('personaId', ParseIntPipe) personaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
    @Res() res: Response,
  ): Promise<void> {
    const metadatos = await this.documentos.metadatos(personaId, id, alcance);
    escribirEncabezados(res, metadatos);
    res.status(200).end();
  }

  @ApiOperation({ summary: 'Ver o descargar un documento del funcionario' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({
    name: 'download',
    required: false,
    description: '1 para forzar la descarga (attachment) en vez de mostrarlo',
  })
  @ApiResponse({
    status: 404,
    description: 'El documento no existe, está borrado o es de otro funcionario.',
  })
  @RequireAlcance('personas.ver')
  @Get(':id')
  async descargar(
    @Param('personaId', ParseIntPipe) personaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
    @Res({ passthrough: true }) res: Response,
    @Query('download') download?: string,
  ): Promise<StreamableFile> {
    const archivo = await this.documentos.obtener(personaId, id, alcance);
    return streamArchivo(res, archivo, { descarga: esVerdadero(download) });
  }

  @ApiOperation({ summary: 'Cambiar la descripción de un documento (null la quita)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: DocumentoPersonalDto })
  @ApiResponse({ status: 409, description: 'Otro documento del funcionario ya tiene esa descripción.' })
  @RequireAlcance('personas.editar')
  @Patch(':id')
  actualizar(
    @Param('personaId', ParseIntPipe) personaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarDocumentoDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.documentos.actualizar(personaId, id, dto, alcance);
  }

  @ApiOperation({ summary: 'Eliminar un documento del funcionario' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: 404,
    description: 'El documento no existe, está borrado o es de otro funcionario.',
  })
  @RequireAlcance('personas.editar')
  @Delete(':id')
  eliminar(
    @Param('personaId', ParseIntPipe) personaId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.documentos.eliminar(personaId, id, BigInt(user.id), alcance);
  }
}

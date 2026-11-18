import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
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
import { PersonasFotoService } from './personas-foto.service.js';
import { PersonaAccesibleGuard } from './persona-accesible.js';
import { SubidaDeArchivo, streamArchivo, validadorDeArchivo } from '../archivos/archivos.http.js';
import { RESTRICCIONES_IMAGEN } from '../archivos/archivos.restricciones.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator.js';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';

// Con `?v=` la URL cambia con cada foto nueva, así que el navegador puede guardarla.
export const CACHE_FOTO_VERSIONADA = 'private, max-age=86400';

/** `:id` es el funcionario: la auditoría toma `params.id` como `entidad_id`. */
@ApiTags('Personas')
@ApiCookieAuth('auth_token')
@ApiParam({ name: 'id', type: Number })
@Auditar({ contexto: 'Personas', entidad: 'Foto de personal' })
@UseGuards(PersonaAccesibleGuard)
@Controller('personas/:id/foto')
export class PersonasFotoController {
  constructor(private readonly fotos: PersonasFotoService) {}

  @ApiOperation({ summary: 'Foto del funcionario' })
  @ApiQuery({
    name: 'v',
    required: false,
    description: 'Id de la foto (`foto_id` de la ficha). Con él, la respuesta se puede cachear.',
  })
  @ApiResponse({ status: 404, description: 'No existe, está fuera de alcance o no tiene foto.' })
  @RequireAlcance('personas.ver')
  @Get()
  async ver(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
    @Res({ passthrough: true }) res: Response,
    @Query('v') version?: string,
  ): Promise<StreamableFile> {
    const archivo = await this.fotos.obtener(id, alcance);
    return streamArchivo(res, archivo, version ? { cacheControl: CACHE_FOTO_VERSIONADA } : {});
  }

  @ApiOperation({ summary: 'Cargar o reemplazar la foto del funcionario (JPG o PNG — máx 2 MB)' })
  @ApiResponse({ status: 200, description: '`foto_id` de la foto nueva.' })
  @ApiResponse({ status: 400, description: 'Falta el archivo, o tipo o contenido inválido.' })
  @ApiResponse({ status: 404, description: 'El funcionario no existe o está fuera de alcance.' })
  @ApiResponse({ status: 409, description: 'La foto cambió mientras se subía.' })
  @ApiResponse({ status: 413, description: 'El archivo supera los 2 MB.' })
  @RequireAlcance('personas.editar')
  @SubidaDeArchivo('archivo', {}, RESTRICCIONES_IMAGEN)
  @Put()
  cargar(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile(validadorDeArchivo(RESTRICCIONES_IMAGEN)) archivo: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.fotos.cargar(id, archivo, BigInt(user.id), alcance);
  }

  @ApiOperation({ summary: 'Quitar la foto del funcionario' })
  @ApiResponse({ status: 404, description: 'No existe, está fuera de alcance o no tiene foto.' })
  @RequireAlcance('personas.editar')
  @HttpCode(HttpStatus.OK)
  @Delete()
  quitar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.fotos.quitar(id, BigInt(user.id), alcance);
  }
}

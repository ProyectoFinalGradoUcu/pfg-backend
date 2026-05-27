import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
  StreamableFile,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Readable } from 'node:stream';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function serviceResponse(httpStatus: number, httpMessage: string, data: unknown) {
  return {
    service_response: {
      service_status: { http_status: String(httpStatus), http_message: httpMessage },
      service_data: data,
    },
  };
}

@ApiTags('Files')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload/:folder')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Subir un archivo a MinIO (PDF, JPG, PNG — máx 10 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('folder') folder: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido. Solo PDF, JPG o PNG');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('El archivo supera el tamaño máximo de 10 MB');
    }

    const key = await this.filesService.upload(folder, file.originalname, file.buffer, file.mimetype);
    return serviceResponse(HttpStatus.CREATED, 'Created', { key });
  }

  @Get('*key')
  @ApiOperation({ summary: 'Descargar o previsualizar un archivo almacenado en MinIO' })
  async getFile(
    @Param('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, contentType, size, filename } = await this.filesService.getObject(key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', size);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return new StreamableFile(stream as Readable);
  }

  @Delete('*key')
  @ApiOperation({ summary: 'Eliminar un archivo de MinIO' })
  async remove(@Param('key') key: string) {
    await this.filesService.delete(key);
    return serviceResponse(HttpStatus.OK, 'OK', null);
  }
}

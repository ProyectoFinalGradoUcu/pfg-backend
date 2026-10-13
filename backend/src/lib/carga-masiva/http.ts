import { FileTypeValidator, MaxFileSizeValidator, ParseFilePipe } from '@nestjs/common';
import type { Response } from 'express';

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ArchivoSubido {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/** Validación común del archivo de una carga masiva: .xlsx de hasta 5 MB. */
export const archivoExcelPipe = () =>
  new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
      new FileTypeValidator({ fileType: MIME_XLSX }),
    ],
  });

export function enviarExcel(res: Response, buffer: Buffer, nombreArchivo: string): void {
  res.setHeader('Content-Type', MIME_XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import { ArchivosService } from '../archivos/archivos.service.js';
import { ConfigDocumentos, DocumentosDeRegistro } from '../archivos/documentos-de-registro.js';

const CONFIG: ConfigDocumentos = {
  modelo: 'ascensos_ordenes',
  entidad: 'ascensos_ordenes',
  articulo: 'La',
  nombre: 'orden',
  noEncontrado: 'Orden de ascenso no encontrada',
  bloqueo: { campo: 'anulada_en', libre: null, mensaje: 'La orden está anulada' },
};

@Injectable()
export class OrdenesDocumentosService extends DocumentosDeRegistro {
  constructor(prisma: PrismaService, archivos: ArchivosService) {
    super(prisma, archivos, CONFIG);
  }
}

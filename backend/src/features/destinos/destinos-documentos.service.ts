import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';
import { ConfigDocumentos, DocumentosDeRegistro } from '../archivos/documentos-de-registro';

const CONFIG: ConfigDocumentos = {
  modelo: 'destinos',
  entidad: 'destinos',
  articulo: 'El',
  nombre: 'destino',
  noEncontrado: 'Destino no encontrado',
  etiquetaBoletin: 'boletín',
};

@Injectable()
export class DestinosDocumentosService extends DocumentosDeRegistro {
  constructor(prisma: PrismaService, archivos: ArchivosService) {
    super(prisma, archivos, CONFIG);
  }
}

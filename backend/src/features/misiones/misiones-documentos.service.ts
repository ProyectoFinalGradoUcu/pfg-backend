import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';
import { ConfigDocumentos, DocumentosDeRegistro } from '../archivos/documentos-de-registro';

const CONFIG_CONVOCATORIA: ConfigDocumentos = {
  modelo: 'convocatorias',
  entidad: 'convocatorias',
  articulo: 'La',
  nombre: 'convocatoria',
  noEncontrado: 'Convocatoria no encontrada',
  etiquetaBoletin: 'boletín',
};

const CONFIG_ASIGNACION: ConfigDocumentos = {
  modelo: 'funcionarios_convocatorias',
  entidad: 'funcionarios_convocatorias',
  articulo: 'La',
  nombre: 'asignación',
  noEncontrado: 'Asignación no encontrada',
  etiquetaBoletin: 'boletín',
};

@Injectable()
export class ConvocatoriasDocumentosService extends DocumentosDeRegistro {
  constructor(prisma: PrismaService, archivos: ArchivosService) {
    super(prisma, archivos, CONFIG_CONVOCATORIA);
  }
}

@Injectable()
export class AsignacionesMisionDocumentosService extends DocumentosDeRegistro {
  constructor(prisma: PrismaService, archivos: ArchivosService) {
    super(prisma, archivos, CONFIG_ASIGNACION);
  }
}

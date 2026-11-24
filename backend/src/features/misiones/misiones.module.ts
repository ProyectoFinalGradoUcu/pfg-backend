import { Module } from '@nestjs/common';
import { MisionesService } from './misiones.service';
import { MisionesCargaService } from './misiones-carga.service';
import { MisionesController } from './misiones.controller';
import { MisionesAuditoria } from './misiones.auditoria';
import { PrismaModule } from '../../lib/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ArchivosModule } from '../archivos/archivos.module';
import {
  AsignacionesMisionDocumentosController,
  ConvocatoriasDocumentosController,
} from './misiones-documentos.controller';
import {
  AsignacionesMisionDocumentosService,
  ConvocatoriasDocumentosService,
} from './misiones-documentos.service';

@Module({
  imports: [PrismaModule, AuthModule, ArchivosModule],
  // Los de documentos primero: `misiones/convocatorias/:id/documentos` no debe caer en las rutas `:misionId/...`.
  controllers: [
    ConvocatoriasDocumentosController,
    AsignacionesMisionDocumentosController,
    MisionesController,
  ],
  providers: [
    MisionesService,
    MisionesCargaService,
    ConvocatoriasDocumentosService,
    AsignacionesMisionDocumentosService,
    MisionesAuditoria,
  ],
})
export class MisionesModule {}

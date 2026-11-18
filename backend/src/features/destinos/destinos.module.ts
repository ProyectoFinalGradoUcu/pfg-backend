import { Module } from '@nestjs/common';
import { DestinosService } from './destinos.service';
import { DestinosCargaService } from './destinos-carga.service';
import { DestinosController } from './destinos.controller';
import { PrismaModule } from '../../lib/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { DestinosDocumentosController } from './destinos-documentos.controller';
import { DestinosDocumentosService } from './destinos-documentos.service';

@Module({
  imports: [PrismaModule, AuthModule, ArchivosModule],
  controllers: [DestinosController, DestinosDocumentosController],
  providers: [DestinosService, DestinosCargaService, DestinosDocumentosService],
})
export class DestinosModule {}

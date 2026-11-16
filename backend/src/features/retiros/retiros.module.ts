import { Module } from '@nestjs/common';
import { RetirosService } from './retiros.service';
import { CierreCarreraService } from './cierre-carrera.service';
import { RetirosController } from './retiros.controller';
import { RetirosDocumentosController } from './retiros-documentos.controller';
import { RetirosDocumentosService } from './retiros-documentos.service';
import { PrismaModule } from '../../lib/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SesionesModule } from '../../lib/sesiones/sesiones.module';
import { DerechaModule } from '../derecha/derecha.module';
import { ArchivosModule } from '../archivos/archivos.module';

@Module({
  imports: [PrismaModule, AuthModule, SesionesModule, DerechaModule, ArchivosModule],
  controllers: [RetirosController, RetirosDocumentosController],
  providers: [RetirosService, CierreCarreraService, RetirosDocumentosService],
  exports: [RetirosService, CierreCarreraService],
})
export class RetirosModule {}

import { Module } from '@nestjs/common';
import { CursosController } from './cursos.controller';
import { CursosService } from './cursos.service';
import { CursosCargaService } from './cursos-carga.service';
import { CursosAuditoria } from './cursos.auditoria';
import { AuthModule } from '../auth/auth.module';
import { ArchivosModule } from '../archivos/archivos.module';
import { DesignacionesDocumentosController } from './designaciones-documentos.controller';
import { DesignacionesDocumentosService } from './designaciones-documentos.service';

@Module({
  imports: [AuthModule, ArchivosModule],
  // El de documentos primero: `cursos/:cursoId/designaciones/...` no debe caer en las rutas de CursosController.
  controllers: [DesignacionesDocumentosController, CursosController],
  providers: [CursosService, CursosCargaService, DesignacionesDocumentosService, CursosAuditoria],
})
export class CursosModule {}

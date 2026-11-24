import { Module } from '@nestjs/common';
import { PrismaModule } from '../../lib/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DerechaModule } from '../derecha/derecha.module.js';
import { ArchivosModule } from '../archivos/archivos.module.js';
import { OrdenesDocumentosController } from './ordenes-documentos.controller.js';
import { OrdenesDocumentosService } from './ordenes-documentos.service.js';
import { AscensoRegistroService } from './ascenso-registro.service.js';
import { ReglasAscensoService } from './reglas-ascenso.service.js';
import { ReglasAscensoController } from './reglas-ascenso.controller.js';
import { ElegibilidadService } from './elegibilidad.service.js';
import { AscensosController } from './ascensos.controller.js';
import { OrdenesAscensoService } from './ordenes-ascenso.service.js';
import { EstadisticasAscensoService } from './estadisticas-ascenso.service.js';
import { AscensosAuditoria } from './ascensos.auditoria.js';

/**
 * `AscensoRegistroService` se exporta porque es el único punto de escritura
 * sobre las tablas del sistema de liquidación.
 */
@Module({
  imports: [PrismaModule, AuthModule, DerechaModule, ArchivosModule],
  controllers: [ReglasAscensoController, AscensosController, OrdenesDocumentosController],
  providers: [
    OrdenesDocumentosService,
    AscensoRegistroService,
    ReglasAscensoService,
    ElegibilidadService,
    OrdenesAscensoService,
    EstadisticasAscensoService,
    AscensosAuditoria,
  ],
  exports: [
    AscensoRegistroService,
    ReglasAscensoService,
    ElegibilidadService,
    OrdenesAscensoService,
    EstadisticasAscensoService,
  ],
})
export class AscensosModule {}

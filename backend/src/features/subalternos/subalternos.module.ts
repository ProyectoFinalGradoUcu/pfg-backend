import { Module } from '@nestjs/common';
import { SubalternosController } from './subalternos.controller.js';
import { PersonasController } from './personas.controller.js';
import { PersonasDocumentosController } from './personas-documentos.controller.js';
import { SubalternosService } from './subalternos.service.js';
import { PersonasCargaService } from './personas-carga.service.js';
import { PersonalPerfilService } from './personal-perfil.service.js';
import { LegajoMilitarService } from './legajo-militar.service.js';
import { PersonasDocumentosService } from './personas-documentos.service.js';
import { AuthModule } from '../auth/auth.module';
import { RetirosModule } from '../retiros/retiros.module.js';
import { ArchivosModule } from '../archivos/archivos.module';

@Module({
  imports: [RetirosModule, AuthModule, ArchivosModule],
  controllers: [SubalternosController, PersonasController, PersonasDocumentosController],
  providers: [
    SubalternosService,
    PersonasCargaService,
    PersonalPerfilService,
    LegajoMilitarService,
    PersonasDocumentosService,
  ],
})
export class SubalternosModule {}

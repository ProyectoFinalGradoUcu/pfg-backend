import { Module } from '@nestjs/common';
import { SubalternosController } from './subalternos.controller.js';
import { PersonasController } from './personas.controller.js';
import { SubalternosService } from './subalternos.service.js';
import { PersonasCargaService } from './personas-carga.service.js';
import { PersonalPerfilService } from './personal-perfil.service.js';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SubalternosController, PersonasController],
  providers: [SubalternosService, PersonasCargaService, PersonalPerfilService],
})
export class SubalternosModule {}

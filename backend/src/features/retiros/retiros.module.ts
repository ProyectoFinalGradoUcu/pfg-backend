import { Module } from '@nestjs/common';
import { RetirosService } from './retiros.service';
import { CierreCarreraService } from './cierre-carrera.service';
import { RetirosController } from './retiros.controller';
import { PrismaModule } from '../../lib/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SesionesModule } from '../../lib/sesiones/sesiones.module';

@Module({
  imports: [PrismaModule, AuthModule, SesionesModule],
  controllers: [RetirosController],
  providers: [RetirosService, CierreCarreraService],
  exports: [RetirosService, CierreCarreraService],
})
export class RetirosModule {}

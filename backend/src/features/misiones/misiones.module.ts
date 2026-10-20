import { Module } from '@nestjs/common';
import { MisionesService } from './misiones.service';
import { MisionesCargaService } from './misiones-carga.service';
import { MisionesController } from './misiones.controller';
import { PrismaModule } from '../../lib/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MisionesController],
  providers: [MisionesService, MisionesCargaService],
})
export class MisionesModule {}

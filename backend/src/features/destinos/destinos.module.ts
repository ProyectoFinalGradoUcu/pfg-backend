import { Module } from '@nestjs/common';
import { DestinosService } from './destinos.service';
import { DestinosCargaService } from './destinos-carga.service';
import { DestinosController } from './destinos.controller';
import { PrismaModule } from '../../lib/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DestinosController],
  providers: [DestinosService, DestinosCargaService],
})
export class DestinosModule {}

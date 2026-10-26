import { Module } from '@nestjs/common';
import { PrismaModule } from '../../lib/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { VuelosController } from './vuelos.controller';
import { VuelosService } from './vuelos.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VuelosController],
  providers: [VuelosService],
})
export class VuelosModule {}

import { Module } from '@nestjs/common';
import { AuditoriaController } from './auditoria.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AuditoriaController],
})
export class AuditoriaHttpModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitacionesController } from './invitaciones.controller';
import { InvitacionesService } from './invitaciones.service';
import { InvitacionesAuditoria } from './invitaciones.auditoria';

@Module({
  imports: [AuthModule],
  controllers: [InvitacionesController],
  providers: [InvitacionesService, InvitacionesAuditoria],
})
export class InvitacionesModule {}

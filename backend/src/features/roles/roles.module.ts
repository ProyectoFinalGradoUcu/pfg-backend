import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { RolesAuditoria } from './roles.auditoria';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [RolesController],
  providers: [RolesService, RolesAuditoria],
  exports: [RolesService],
})
export class RolesModule {}

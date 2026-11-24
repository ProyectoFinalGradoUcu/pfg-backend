import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosAuditoria } from './usuarios.auditoria';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosAuditoria],
  exports: [UsuariosService],
})
export class UsuariosModule {}

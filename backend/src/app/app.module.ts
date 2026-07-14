import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../features/auth/auth.module';
import { PermisosModule } from '../features/permisos/permisos.module';
import { RolesModule } from '../features/roles/roles.module';
import { UsuariosModule } from '../features/usuarios/usuarios.module';
import { SubalternosModule } from '../features/subalternos/subalternos.module';
import { MisionesModule } from '../features/misiones/misiones.module';
import { FilesModule } from '../features/files/files.module';
import { PrismaModule } from '../lib/prisma.module';
import { CursosModule } from '../features/cursos/cursos.module';
import { CatalogosModule } from '../features/catalogos/catalogos.module';
import { HistorialCursosModule } from '../features/historial-cursos/historial-cursos.module';
import { AuditoriaModule } from '../features/auditoria/auditoria.module';
import { AuditoriaHttpModule } from '../features/auditoria/auditoria-http.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    AuditoriaModule,
    AuthModule,
    PermisosModule,
    RolesModule,
    UsuariosModule,
    SubalternosModule,
    MisionesModule,
    FilesModule,
    CursosModule,
    CatalogosModule,
    HistorialCursosModule,
    AuditoriaHttpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

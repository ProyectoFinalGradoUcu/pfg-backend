import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaInterceptor } from './auditoria.interceptor';
import { AuditoriaFotos } from './auditoria-fotos';
import { AuditoriaNombres } from './auditoria-nombres';

@Global()
@Module({
  providers: [
    AuditoriaService,
    AuditoriaFotos,
    AuditoriaNombres,
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
  exports: [AuditoriaService, AuditoriaFotos, AuditoriaNombres],
})
export class AuditoriaModule {}

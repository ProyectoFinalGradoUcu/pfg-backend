import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaInterceptor } from './auditoria.interceptor';

@Global()
@Module({
  providers: [
    AuditoriaService,
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}

import { Global, Module } from '@nestjs/common';
import { SesionesService } from './sesiones.service';

@Global()
@Module({
  providers: [SesionesService],
  exports: [SesionesService],
})
export class SesionesModule {}

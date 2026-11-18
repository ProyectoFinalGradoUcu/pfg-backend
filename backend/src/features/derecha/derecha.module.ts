import { Module } from '@nestjs/common';
import { PrismaModule } from '../../lib/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DerechaController } from './derecha.controller.js';
import { DerechaService } from './derecha.service.js';

/**
 * `DerechaService` se exporta porque alta, baja, ascenso y cambio de escalafón
 * lo llaman dentro de sus transacciones.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DerechaController],
  providers: [DerechaService],
  exports: [DerechaService],
})
export class DerechaModule {}

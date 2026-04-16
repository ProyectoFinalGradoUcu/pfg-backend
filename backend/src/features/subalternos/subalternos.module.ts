import { Module } from '@nestjs/common';
import { SubalternosController } from './subalternos.controller.js';
import { SubalternosService } from './subalternos.service.js';

@Module({
  controllers: [SubalternosController],
  providers: [SubalternosService],
})
export class SubalternosModule {}

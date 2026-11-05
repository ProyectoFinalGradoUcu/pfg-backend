import { Module } from '@nestjs/common';
import { ComisionesController } from './comisiones.controller';
import { ComisionesService } from './comisiones.service';

@Module({ controllers: [ComisionesController], providers: [ComisionesService] })
export class ComisionesModule {}

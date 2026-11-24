import { Module } from '@nestjs/common';
import { ComisionesController } from './comisiones.controller';
import { ComisionesService } from './comisiones.service';
import { ComisionesAuditoria } from './comisiones.auditoria';

@Module({ controllers: [ComisionesController], providers: [ComisionesService, ComisionesAuditoria] })
export class ComisionesModule {}

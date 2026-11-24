import { Module } from '@nestjs/common';
import { CatalogosController } from './catalogos.controller.js';
import { CatalogosService } from './catalogos.service.js';
import { CatalogoUnidadesService } from './catalogo-unidades.service.js';
import { CatalogosAuditoria } from './catalogos.auditoria.js';

@Module({
  controllers: [CatalogosController],
  providers: [CatalogosService, CatalogoUnidadesService, CatalogosAuditoria],
})
export class CatalogosModule {}

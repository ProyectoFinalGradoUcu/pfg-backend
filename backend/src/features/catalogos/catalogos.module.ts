import { Module } from '@nestjs/common';
import { CatalogosController } from './catalogos.controller.js';
import { CatalogosService } from './catalogos.service.js';
import { CatalogoUnidadesService } from './catalogo-unidades.service.js';

@Module({
  controllers: [CatalogosController],
  providers: [CatalogosService, CatalogoUnidadesService],
})
export class CatalogosModule {}

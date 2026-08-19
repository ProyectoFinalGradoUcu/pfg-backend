import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiParam } from '@nestjs/swagger';
import { SubalternosService } from './subalternos.service.js';
import { CreateSubalternoDto } from './dto/create-subalterno.dto.js';
import { UpdateSubalternoDto } from './dto/update-subalterno.dto.js';
import { Auditar } from '../auditoria/decorators/auditar.decorator.js';
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator.js';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';

@ApiTags('Subalternos')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Subalternos', entidad: 'Subalterno' })
@Controller('subalternos')
export class SubalternosController {
  constructor(private readonly subalternosService: SubalternosService) {}

  @ApiOperation({ summary: 'Crear subalterno', description: 'Registra un nuevo subalterno en el sistema.' })
  @ApiResponse({ status: 201, description: 'Subalterno creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @RequireAlcance('personas.crear')
  @Post()
  async create(
    @Body('service_request') dto: CreateSubalternoDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.subalternosService.create(dto, alcance);
  }

  @ApiOperation({ summary: 'Actualizar subalterno', description: 'Actualiza los datos de un subalterno existente.' })
  @ApiParam({ name: 'id', description: 'ID del subalterno', example: 1 })
  @ApiResponse({ status: 200, description: 'Subalterno actualizado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Subalterno no encontrado.' })
  @RequireAlcance('personas.editar')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body('service_request') dto: UpdateSubalternoDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.subalternosService.update(id, dto, alcance);
  }

  @ApiOperation({ summary: 'Eliminar subalterno', description: 'Elimina un subalterno del sistema.' })
  @ApiParam({ name: 'id', description: 'ID del subalterno', example: 1 })
  @ApiResponse({ status: 200, description: 'Subalterno eliminado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Subalterno no encontrado.' })
  @RequireAlcance('personas.eliminar')
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.subalternosService.remove(id, alcance);
  }
}

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
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@ApiTags('Subalternos')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Subalternos', entidad: 'Subalterno' })
@Controller('subalternos')
export class SubalternosController {
  constructor(private readonly subalternosService: SubalternosService) {}

  @ApiOperation({ summary: 'Crear subalterno', description: 'Registra un nuevo subalterno en el sistema.' })
  @ApiResponse({ status: 201, description: 'Subalterno creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @RequirePermissions('personas.crear')
  @Post()
  async create(@Body('service_request') dto: CreateSubalternoDto) {
    return this.subalternosService.create(dto);
  }

  @ApiOperation({ summary: 'Actualizar subalterno', description: 'Actualiza los datos de un subalterno existente.' })
  @ApiParam({ name: 'id', description: 'ID del subalterno', example: 1 })
  @ApiResponse({ status: 200, description: 'Subalterno actualizado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Subalterno no encontrado.' })
  @RequirePermissions('personas.editar')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body('service_request') dto: UpdateSubalternoDto,
  ) {
    return this.subalternosService.update(id, dto);
  }

  @ApiOperation({ summary: 'Eliminar subalterno', description: 'Elimina un subalterno del sistema.' })
  @ApiParam({ name: 'id', description: 'ID del subalterno', example: 1 })
  @ApiResponse({ status: 200, description: 'Subalterno eliminado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Subalterno no encontrado.' })
  @RequirePermissions('personas.eliminar')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.subalternosService.remove(id);
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { MisionesService } from './misiones.service';
import { CreateMisionRequestDto } from './dto/create-mision-request.dto';
import { UpdateMisionRequestDto } from './dto/update-mision-request.dto';
import { AddFuncionariosRequestDto } from './dto/add-funcionarios-request.dto';
import { UpdateFuncionarioRequestDto } from './dto/update-funcionario-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Misiones')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('misiones')
export class MisionesController {
  constructor(private readonly misionesService: MisionesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar misiones paginadas con stats' })
  @RequirePermissions('misiones.ver')
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.misionesService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener el detalle de una misión por ID' })
  @RequirePermissions('misiones.ver')
  async findOne(@Param('id') id: string) {
    return this.misionesService.findOne(id);
  }

  @Get(':id/funcionarios')
  @ApiOperation({ summary: 'Obtener los funcionarios de una misión paginados' })
  @RequirePermissions('misiones.ver')
  async getFuncionarios(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.misionesService.getFuncionariosDeMision(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva misión' })
  @RequirePermissions('misiones.gestionar')
  async create(@Body() body: CreateMisionRequestDto) {
    return this.misionesService.create(body.service_request);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar campos de una misión' })
  @RequirePermissions('misiones.gestionar')
  async update(@Param('id') id: string, @Body() body: UpdateMisionRequestDto) {
    return this.misionesService.update(id, body.service_request);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una misión y todos sus funcionarios asignados' })
  @RequirePermissions('misiones.gestionar')
  async remove(@Param('id') id: string) {
    return this.misionesService.remove(id);
  }

  @Post(':id/funcionarios')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar uno o varios funcionarios a una misión' })
  @RequirePermissions('misiones.gestionar')
  async addFuncionarios(@Param('id') id: string, @Body() body: AddFuncionariosRequestDto) {
    return this.misionesService.addFuncionarios(id, body.service_request.funcionarios_misiones);
  }

  @Patch(':id/funcionarios/:personaId')
  @ApiOperation({ summary: 'Actualizar datos de un funcionario en la misión' })
  @RequirePermissions('misiones.gestionar')
  async updateFuncionario(
    @Param('id') id: string,
    @Param('personaId') personaId: string,
    @Body() body: UpdateFuncionarioRequestDto,
  ) {
    return this.misionesService.updateFuncionario(id, personaId, body.service_request);
  }

  @Delete(':id/funcionarios/:personaId')
  @ApiOperation({ summary: 'Quitar un funcionario específico de la misión' })
  @RequirePermissions('misiones.gestionar')
  async deleteFuncionario(@Param('id') id: string, @Param('personaId') personaId: string) {
    return this.misionesService.deleteFuncionario(id, personaId);
  }

  @Delete(':id/funcionarios')
  @ApiOperation({ summary: 'Quitar todos los funcionarios de una misión' })
  @RequirePermissions('misiones.gestionar')
  async deleteAllFuncionarios(@Param('id') id: string) {
    return this.misionesService.deleteAllFuncionarios(id);
  }
}

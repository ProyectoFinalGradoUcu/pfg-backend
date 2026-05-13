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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

function serviceResponse(httpStatus: number, httpMessage: string, data: unknown) {
  return {
    service_response: {
      service_status: {
        http_status: String(httpStatus),
        http_message: httpMessage,
      },
      service_data: data,
    },
  };
}

@ApiTags('Misiones')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('misiones')
export class MisionesController {
  constructor(private readonly misionesService: MisionesService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todas las misiones paginadas y stats' })
  @RequirePermissions('misiones.ver')
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const data = await this.misionesService.findAll(pageNum, limitNum);
    return serviceResponse(HttpStatus.OK, 'OK', data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una misión por ID con sus funcionarios' })
  @RequirePermissions('misiones.ver')
  async findOne(@Param('id') id: string) {
    const data = await this.misionesService.findOne(id);
    return serviceResponse(HttpStatus.OK, 'OK', data);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva misión' })
  @RequirePermissions('misiones.gestionar')
  async create(@Body() body: CreateMisionRequestDto) {
    const data = await this.misionesService.create(body.service_request);
    return serviceResponse(HttpStatus.CREATED, 'Created', data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una misión (reemplaza lista de funcionarios si se envía)' })
  @RequirePermissions('misiones.gestionar')
  async update(@Param('id') id: string, @Body() body: UpdateMisionRequestDto) {
    const data = await this.misionesService.update(id, body.service_request);
    return serviceResponse(HttpStatus.OK, 'OK', data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una misión y sus funcionarios asignados' })
  @RequirePermissions('misiones.gestionar')
  async remove(@Param('id') id: string) {
    await this.misionesService.remove(id);
    return serviceResponse(HttpStatus.OK, 'OK', null);
  }
}

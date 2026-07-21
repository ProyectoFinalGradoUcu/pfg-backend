import {
  Controller,
  Get,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { HistorialCursosService } from './historial-cursos.service';
import { CreateHistorialCursoDto } from './dto/create-historial-curso.dto';
import { ListHistorialCursosQueryDto } from './dto/list-historial-cursos-query.dto';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Auditar } from '../auditoria/decorators/auditar.decorator';

@ApiTags('Historial Cursos')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Historial de cursos', entidad: 'Historial de curso' })
@Controller('historial-cursos')
export class HistorialCursosController {
  constructor(private readonly historialCursosService: HistorialCursosService) {}

  @Get()
  @RequirePermissions('cursos.ver')
  @ApiOperation({ summary: 'Listar historial de cursos', description: 'Retorna lista paginada de todos los cursos asignados a funcionarios.' })
  @ApiResponse({ status: 200, description: 'Lista obtenida exitosamente.' })
  async findAll(@Query() query: ListHistorialCursosQueryDto) {
    return this.historialCursosService.findAll(query);
  }

  @Post()
  @RequirePermissions('cursos.gestionar')
  @ApiOperation({ summary: 'Registrar historial de curso', description: 'Crea un nuevo curso y lo asigna a un funcionario.' })
  @ApiResponse({ status: 201, description: 'Registro creado exitosamente.' })
  async create(@Body() dto: CreateHistorialCursoDto) {
    return this.historialCursosService.create(dto);
  }
}

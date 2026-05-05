import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CursosService } from './cursos.service';
import { CursoDto } from './dto/curso.dto';

@ApiTags('Cursos')
@ApiBearerAuth()
@Controller('cursos')
export class CursosController {
  constructor(private readonly cursosService: CursosService) {}

  @ApiOperation({
    summary: 'Crear Curso',
    description: 'Registra un nuevo curso en el sistema.',
  })
  @ApiResponse({ status: 201, description: 'Curso  creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @Post()
  async create(@Body('service_request') dto: CursoDto) {
    return this.cursosService.create(dto);
  }

  @ApiOperation({
    summary: 'Obtiene todos los cursos',
    description: 'Retorna una lista de todos los cursos registrados.',
  })
  @ApiResponse({ status: 200, description: 'Lista de cursos obtenida exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @Get()
  async get() {
    return this.cursosService.get();
  }

  @ApiOperation({
    summary: 'Obtiene un curso por ID con sus módulos',
    description: 'Retorna el detalle de un curso y sus módulos asociados.',
  })
  @ApiResponse({ status: 200, description: 'Curso obtenido exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.cursosService.getById(id);
  }

  @ApiOperation({
    summary: 'Elimina un curso',
    description: 'Elimina un curso por su ID.',
  })
  @ApiResponse({ status: 200, description: 'Curso eliminado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  @Delete(':id')
  async removeCurso(@Param('id', ParseIntPipe) id: number) {
    return this.cursosService.removeCurso(id);
  }

  @ApiOperation({
    summary: 'Elimina un módulo de un curso',
    description: 'Elimina un módulo por su ID dentro de un curso específico.',
  })
  @ApiResponse({ status: 200, description: 'Módulo eliminado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso o módulo no encontrado.' })
  @Delete(':cursoId/modulos/:moduloId')
  async removeModuloCurso(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('moduloId', ParseIntPipe) moduloId: number,
  ) {
    return this.cursosService.removeModuloCurso(cursoId, moduloId);
  }
}

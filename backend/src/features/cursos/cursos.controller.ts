import {
  Controller,
  Post,

  Body,

} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CursosService } from './cursos.service';
import { CursoDto } from './dto/curso.dto';


@ApiTags('Cursos')
@ApiBearerAuth()
@Controller('cursos')
export class CursosController {
  constructor(private readonly cursosService: CursosService) {}

  @ApiOperation({ summary: 'Crear Curso', description: 'Registra un nuevo curso en el sistema.' })
  @ApiResponse({ status: 201, description: 'Curso  creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @Post()
  async create(@Body('service_request') dto: CursoDto) {
    return this.cursosService.create(dto);
  }

  
}

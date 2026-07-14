import {
  Controller,
  Post,
  Patch,
  Body,
  Get,
  Delete,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { CursosService } from './cursos.service';
import { CursoDto } from './dto/curso.dto';
import { ListCursosQueryDto } from './dto/list-cursos-query.dto';
import { CreateModuloCursoDto } from './dto/create-modulo-curso.dto';
import { MarcarCompletacionDto } from './dto/completacion-modulo.dto';
import { CursosPorFuncionarioQueryDto } from './dto/cursos-por-funcionario-query.dto';
import { CreateDesignacionDto } from './dto/create-designacion.dto';
import { UpdateCursoDto } from './dto/update-curso.dto';
import { UpdateDesignacionDto } from './dto/update-designacion.dto';
import { BajaDesignacionDto } from './dto/baja-designacion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';

@ApiTags('Cursos')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Auditar({ contexto: 'Cursos', entidad: 'Curso' })
@Controller('cursos')
export class CursosController {
  constructor(private readonly cursosService: CursosService) {}

  @Post()
  @RequirePermissions('cursos.gestionar')
  @ApiOperation({ summary: 'Crear curso', description: 'Registra un nuevo curso en el sistema.' })
  @ApiResponse({ status: 201, description: 'Curso creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 409, description: 'Ya existe un curso con ese nombre.' })
  async create(@Body() dto: CursoDto) {
    return this.cursosService.create(dto);
  }

  @Get()
  @RequirePermissions('cursos.ver')
  @ApiOperation({ summary: 'Listar cursos', description: 'Retorna una lista paginada de cursos.' })
  @ApiResponse({ status: 200, description: 'Lista de cursos obtenida exitosamente.' })
  async findAll(@Query() query: ListCursosQueryDto) {
    return this.cursosService.findAll(query);
  }

  @Get('funcionarios')
  @RequirePermissions('cursos.ver')
  @ApiOperation({ summary: 'Cursos por funcionario', description: 'Retorna los cursos realizados por cada funcionario. Filtrá por cédula para ver los de una persona específica.' })
  @ApiResponse({ status: 200, description: 'Lista obtenida exitosamente.' })
  async getCursosPorFuncionario(@Query() query: CursosPorFuncionarioQueryDto) {
    return this.cursosService.getCursosPorFuncionario(query);
  }

  @Get(':id')
  @RequirePermissions('cursos.ver')
  @ApiOperation({ summary: 'Obtener curso por ID', description: 'Retorna el detalle de un curso con sus módulos.' })
  @ApiResponse({ status: 200, description: 'Curso obtenido exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.cursosService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('cursos.gestionar')
  @ApiOperation({ summary: 'Editar curso', description: 'Actualiza nombre, institución y/u obligatoriedad de un curso.' })
  @ApiResponse({ status: 200, description: 'Curso actualizado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  @ApiResponse({ status: 409, description: 'Ya existe un curso con ese nombre.' })
  async editarCurso(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCursoDto,
  ) {
    return this.cursosService.editarCurso(id, dto);
  }

  @Post(':cursoId/designaciones')
  @RequirePermissions('cursos.gestionar')
  @ApiOperation({
    summary: 'Designar / dictar curso',
    description:
      'Designa un grupo de personas a un curso (o a módulos puntuales) bajo una orden/boletín. Sirve para el primer dictado y para re-dictados.',
  })
  @ApiResponse({ status: 201, description: 'Designación registrada exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso o módulo no encontrado.' })
  async crearDesignacion(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Body() dto: CreateDesignacionDto,
  ) {
    return this.cursosService.crearDesignacion(cursoId, dto);
  }

  @Patch(':cursoId/designaciones/:designacionId')
  @RequirePermissions('cursos.gestionar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cargar calificación', description: 'Actualiza la calificación de una designación y marca el estado como completado.' })
  @ApiResponse({ status: 200, description: 'Calificación registrada.' })
  @ApiResponse({ status: 404, description: 'Designación no encontrada.' })
  async actualizarDesignacion(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('designacionId', ParseIntPipe) designacionId: number,
    @Body() dto: UpdateDesignacionDto,
  ) {
    return this.cursosService.actualizarDesignacion(cursoId, designacionId, dto);
  }

  @Patch(':cursoId/designaciones/:designacionId/baja')
  @RequirePermissions('cursos.gestionar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dar de baja a un funcionario de un curso',
    description: 'Baja lógica de la inscripción con motivo obligatorio. Se registra fecha y autor.',
  })
  @ApiResponse({ status: 200, description: 'Inscripción dada de baja.' })
  @ApiResponse({ status: 404, description: 'Designación no encontrada.' })
  @ApiResponse({ status: 409, description: 'La inscripción ya estaba dada de baja.' })
  async darDeBaja(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('designacionId', ParseIntPipe) designacionId: number,
    @Body() dto: BajaDesignacionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cursosService.darDeBajaDesignacion(cursoId, designacionId, dto.motivo, user.id);
  }

  @Patch(':cursoId/designaciones/:designacionId/reactivar')
  @RequirePermissions('cursos.gestionar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivar una inscripción dada de baja',
    description: 'Revierte la baja lógica: la inscripción vuelve a estar activa.',
  })
  @ApiResponse({ status: 200, description: 'Inscripción reactivada.' })
  @ApiResponse({ status: 404, description: 'Designación no encontrada.' })
  @ApiResponse({ status: 409, description: 'La inscripción no estaba dada de baja.' })
  async reactivar(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('designacionId', ParseIntPipe) designacionId: number,
  ) {
    return this.cursosService.reactivarDesignacion(cursoId, designacionId);
  }

  @Post(':cursoId/modulos')
  @RequirePermissions('cursos.gestionar')
  @ApiOperation({ summary: 'Agregar módulo a un curso', description: 'Crea un nuevo módulo dentro del curso indicado.' })
  @ApiResponse({ status: 201, description: 'Módulo creado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  async createModulo(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Body() dto: CreateModuloCursoDto,
  ) {
    return this.cursosService.createModulo(cursoId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cursos.gestionar')
  @ApiOperation({ summary: 'Eliminar curso', description: 'Elimina un curso por su ID.' })
  @ApiResponse({ status: 200, description: 'Curso eliminado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  async removeCurso(@Param('id', ParseIntPipe) id: number) {
    return this.cursosService.removeCurso(id);
  }

  @Post(':cursoId/modulos/:moduloId/completaciones')
  @RequirePermissions('cursos.gestionar')
  @ApiOperation({ summary: 'Marcar completación de módulo', description: 'Registra o actualiza la completación de un módulo para un funcionario.' })
  @ApiResponse({ status: 201, description: 'Completación registrada exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso o módulo no encontrado.' })
  async marcarCompletacion(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('moduloId', ParseIntPipe) moduloId: number,
    @Body() dto: MarcarCompletacionDto,
  ) {
    return this.cursosService.marcarCompletacion(cursoId, moduloId, dto);
  }

  @Get(':cursoId/modulos/:moduloId/completaciones')
  @RequirePermissions('cursos.ver')
  @ApiOperation({ summary: 'Ver completaciones de un módulo', description: 'Retorna todos los funcionarios que completaron el módulo indicado.' })
  @ApiResponse({ status: 200, description: 'Lista de completaciones obtenida exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso o módulo no encontrado.' })
  async getCompletacionesModulo(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('moduloId', ParseIntPipe) moduloId: number,
  ) {
    return this.cursosService.getCompletacionesModulo(cursoId, moduloId);
  }

  @Delete(':cursoId/modulos/:moduloId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cursos.gestionar')
  @ApiOperation({ summary: 'Eliminar módulo de un curso', description: 'Elimina un módulo por su ID dentro de un curso.' })
  @ApiResponse({ status: 200, description: 'Módulo eliminado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso o módulo no encontrado.' })
  async removeModuloCurso(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('moduloId', ParseIntPipe) moduloId: number,
  ) {
    return this.cursosService.removeModuloCurso(cursoId, moduloId);
  }
}

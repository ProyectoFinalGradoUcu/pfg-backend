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
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';

@ApiTags('Cursos')
@ApiCookieAuth('auth_token')
@Auditar({ contexto: 'Cursos', entidad: 'Curso' })
@Controller('cursos')
export class CursosController {
  constructor(private readonly cursosService: CursosService) {}

  @Post()
  @RequireAlcance('cursos.gestionar')
  @ApiOperation({ summary: 'Crear curso', description: 'Registra un nuevo curso en el sistema.' })
  @ApiResponse({ status: 201, description: 'Curso creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({ status: 409, description: 'Ya existe un curso con ese nombre.' })
  async create(@Body() dto: CursoDto, @Alcance() alcance: AlcanceResuelto) {
    return this.cursosService.create(dto, alcance);
  }

  @Get()
  @RequireAlcance('cursos.ver')
  @ApiOperation({ summary: 'Listar cursos', description: 'Retorna una lista paginada de cursos.' })
  @ApiResponse({ status: 200, description: 'Lista de cursos obtenida exitosamente.' })
  async findAll(
    @Query() query: ListCursosQueryDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.findAll(query, alcance);
  }

  @Get('funcionarios')
  @RequireAlcance('cursos.ver')
  @ApiOperation({ summary: 'Cursos por funcionario', description: 'Retorna los cursos realizados por cada funcionario. Filtrá por cédula para ver los de una persona específica.' })
  @ApiResponse({ status: 200, description: 'Lista obtenida exitosamente.' })
  async getCursosPorFuncionario(@Query() query: CursosPorFuncionarioQueryDto, @Alcance() alcance: AlcanceResuelto) {
    return this.cursosService.getCursosPorFuncionario(query, alcance);
  }

  @Get(':id')
  @RequireAlcance('cursos.ver')
  @ApiOperation({ summary: 'Obtener curso por ID', description: 'Retorna el detalle de un curso con sus módulos.' })
  @ApiResponse({ status: 200, description: 'Curso obtenido exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  async getById(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.getById(id, alcance);
  }

  @Patch(':id')
  @RequireAlcance('cursos.gestionar')
  @ApiOperation({ summary: 'Editar curso', description: 'Actualiza nombre, institución y/u obligatoriedad de un curso.' })
  @ApiResponse({ status: 200, description: 'Curso actualizado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  @ApiResponse({ status: 409, description: 'Ya existe un curso con ese nombre.' })
  async editarCurso(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCursoDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.editarCurso(id, dto, alcance);
  }

  @Post(':cursoId/designaciones')
  @RequireAlcance('cursos.gestionar')
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
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.crearDesignacion(cursoId, dto, alcance);
  }

  @Patch(':cursoId/designaciones/:designacionId')
  @RequireAlcance('cursos.gestionar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar resultado', description: 'Marca la designación como aprobada o desaprobada. La calificación y la observación son opcionales.' })
  @ApiResponse({ status: 200, description: 'Resultado registrado.' })
  @ApiResponse({ status: 404, description: 'Designación no encontrada.' })
  async actualizarDesignacion(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('designacionId', ParseIntPipe) designacionId: number,
    @Body() dto: UpdateDesignacionDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.actualizarDesignacion(cursoId, designacionId, dto, alcance);
  }

  @Patch(':cursoId/designaciones/:designacionId/baja')
  @RequireAlcance('cursos.gestionar')
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
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.darDeBajaDesignacion(
      cursoId,
      designacionId,
      dto.motivo,
      user.id,
      alcance,
    );
  }

  @Patch(':cursoId/designaciones/:designacionId/reactivar')
  @RequireAlcance('cursos.gestionar')
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
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.reactivarDesignacion(cursoId, designacionId, alcance);
  }

  @Post(':cursoId/modulos')
  @RequireAlcance('cursos.gestionar')
  @ApiOperation({ summary: 'Agregar módulo a un curso', description: 'Crea un nuevo módulo dentro del curso indicado.' })
  @ApiResponse({ status: 201, description: 'Módulo creado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  async createModulo(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Body() dto: CreateModuloCursoDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.createModulo(cursoId, dto, alcance);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireAlcance('cursos.gestionar')
  @ApiOperation({ summary: 'Eliminar curso', description: 'Elimina un curso por su ID.' })
  @ApiResponse({ status: 200, description: 'Curso eliminado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado.' })
  async removeCurso(
    @Param('id', ParseIntPipe) id: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.removeCurso(id, alcance);
  }

  @Post(':cursoId/modulos/:moduloId/completaciones')
  @RequireAlcance('cursos.gestionar')
  @ApiOperation({ summary: 'Marcar completación de módulo', description: 'Registra o actualiza la completación de un módulo para un funcionario.' })
  @ApiResponse({ status: 201, description: 'Completación registrada exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso o módulo no encontrado.' })
  async marcarCompletacion(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('moduloId', ParseIntPipe) moduloId: number,
    @Body() dto: MarcarCompletacionDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.marcarCompletacion(cursoId, moduloId, dto, alcance);
  }

  @Get(':cursoId/modulos/:moduloId/completaciones')
  @RequireAlcance('cursos.ver')
  @ApiOperation({ summary: 'Ver completaciones de un módulo', description: 'Retorna todos los funcionarios que completaron el módulo indicado.' })
  @ApiResponse({ status: 200, description: 'Lista de completaciones obtenida exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso o módulo no encontrado.' })
  async getCompletacionesModulo(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('moduloId', ParseIntPipe) moduloId: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.getCompletacionesModulo(cursoId, moduloId, alcance);
  }

  @Delete(':cursoId/modulos/:moduloId')
  @HttpCode(HttpStatus.OK)
  @RequireAlcance('cursos.gestionar')
  @ApiOperation({ summary: 'Eliminar módulo de un curso', description: 'Elimina un módulo por su ID dentro de un curso.' })
  @ApiResponse({ status: 200, description: 'Módulo eliminado exitosamente.' })
  @ApiResponse({ status: 404, description: 'Curso o módulo no encontrado.' })
  async removeModuloCurso(
    @Param('cursoId', ParseIntPipe) cursoId: number,
    @Param('moduloId', ParseIntPipe) moduloId: number,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.cursosService.removeModuloCurso(cursoId, moduloId, alcance);
  }
}

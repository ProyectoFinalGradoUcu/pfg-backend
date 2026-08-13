import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportesService } from './reportes.service';
import { CustomReporteDto } from './dto/custom-reporte.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequireAlcance, Alcance } from '../../lib/alcance/alcance.decorator';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { Auditar } from '../auditoria/decorators/auditar.decorator';

/** Parámetros reservados de la ruta que no son filtros del reporte. */
const RESERVADOS = new Set(['clave']);

function extraerFiltros(query: Record<string, unknown>): Record<string, string | undefined> {
  const filtros: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    if (RESERVADOS.has(k)) continue;
    if (v === undefined || v === null || v === '') continue;
    filtros[k] = Array.isArray(v) ? String(v[0]) : String(v);
  }
  return filtros;
}

@ApiTags('Reportes')
@ApiCookieAuth('auth_token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Auditar({ contexto: 'Reportes', entidad: 'Reporte' })
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get()
  @ApiOperation({ summary: 'Catálogo de reportes disponibles' })
  @RequireAlcance('reportes.ejecutar')
  listar() {
    return this.reportesService.listar();
  }

  // ─── Reportes personalizados (rutas estáticas antes de :clave) ──────────

  @Get('custom/fuentes')
  @ApiOperation({ summary: 'Fuentes de datos para el reporte personalizado' })
  @RequireAlcance('reportes.ejecutar')
  fuentes() {
    return this.reportesService.listarFuentes();
  }

  @Post('custom/preview')
  @ApiOperation({ summary: 'Ejecutar un reporte personalizado' })
  @RequireAlcance('reportes.ejecutar')
  previewCustom(
    @Body() dto: CustomReporteDto,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.reportesService.previewCustom(dto, alcance);
  }

  @Post('custom/export')
  @ApiOperation({ summary: 'Exportar un reporte personalizado a Excel' })
  @RequireAlcance('reportes.ejecutar')
  async exportCustom(
    @Body() dto: CustomReporteDto,
    @Res() res: Response,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    const { buffer, nombreArchivo } = await this.reportesService.exportarCustom(dto, alcance);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  }

  @Get(':clave')
  @ApiOperation({ summary: 'Definición de un reporte (parámetros con opciones)' })
  @RequireAlcance('reportes.ejecutar')
  obtener(@Param('clave') clave: string) {
    return this.reportesService.obtenerDefinicion(clave);
  }

  @Get(':clave/preview')
  @ApiOperation({ summary: 'Ejecutar un reporte y devolver los datos' })
  @RequireAlcance('reportes.ejecutar')
  preview(
    @Param('clave') clave: string,
    @Query() query: Record<string, unknown>,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    return this.reportesService.ejecutar(clave, extraerFiltros(query), alcance);
  }

  @Get(':clave/export')
  @ApiOperation({ summary: 'Exportar un reporte a Excel (.xlsx)' })
  @RequireAlcance('reportes.ejecutar')
  async export(
    @Param('clave') clave: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
    @Alcance() alcance: AlcanceResuelto,
  ) {
    const { buffer, nombreArchivo } = await this.reportesService.exportarXlsx(
      clave,
      extraerFiltros(query),
      alcance,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  }
}

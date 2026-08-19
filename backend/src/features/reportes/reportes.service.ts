import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Borders, Workbook } from 'exceljs';
import { PrismaService } from '../../lib/prisma.service';
import { REPORTES } from './definiciones';
import { FUENTES } from './custom';
import { FuenteCatalogo, FuenteCustom } from './custom/fuentes.types';
import { CustomReporteDto } from './dto/custom-reporte.dto';
import {
  AlcanceResuelto,
  unidadIdDeAlcance,
} from '../../lib/alcance/alcance.types';
import {
  FUENTES_CON_ALCANCE_UNIDAD,
  MENSAJE_REPORTE_SIN_ALCANCE,
  REPORTES_CON_ALCANCE_UNIDAD,
} from './alcance-reportes';
import {
  ColumnaReporte,
  DefinicionReporte,
  OpcionParametro,
  ParametroReporte,
  ReporteCatalogo,
  ResultadoReporte,
  SeccionReporte,
} from './reportes.types';

@Injectable()
export class ReportesService {
  private readonly registro = new Map<string, DefinicionReporte>(
    REPORTES.map((r) => [r.clave, r]),
  );
  private readonly fuentes = new Map<string, FuenteCustom>(
    FUENTES.map((f) => [f.clave, f]),
  );

  constructor(private readonly prisma: PrismaService) {}

  /* Catálogo de reportes */
  listar(): ReporteCatalogo[] {
    return [...this.registro.values()].map(({ ejecutar: _ejecutar, ...meta }) => meta);
  }

  /* Definición de un reporte. */
  async obtenerDefinicion(clave: string): Promise<ReporteCatalogo> {
    const def = this.requerir(clave);
    const parametros = await Promise.all(
      def.parametros.map((p) => this.resolverParametro(p)),
    );
    const { ejecutar: _ejecutar, ...meta } = def;
    return { ...meta, parametros };
  }

  /**
   * Fuerza `unidad_id` cuando el alcance es de unidad, y bloquea los reportes que no saben
   * acotarse en vez de dejarlos devolver el padrón completo.
   */
  private aplicarAlcance(
    clave: string,
    filtros: Record<string, string | undefined>,
    permitidos: Set<string>,
    alcance?: AlcanceResuelto,
  ): Record<string, string | undefined> {
    if (!alcance) return filtros;
    const unidadId = unidadIdDeAlcance(alcance);
    if (unidadId === null) return filtros;

    if (!permitidos.has(clave)) {
      throw new ForbiddenException(MENSAJE_REPORTE_SIN_ALCANCE);
    }

    return { ...filtros, unidad_id: unidadId.toString() };
  }

  /* Ejecuta el reporte y devuelve los datos para mostrar en pantalla */
  async ejecutar(
    clave: string,
    filtros: Record<string, string | undefined>,
    alcance?: AlcanceResuelto,
  ): Promise<ResultadoReporte> {
    const def = this.requerir(clave);
    const conAlcance = this.aplicarAlcance(
      clave,
      filtros,
      REPORTES_CON_ALCANCE_UNIDAD,
      alcance,
    );
    return def.ejecutar({ prisma: this.prisma, filtros: conAlcance });
  }

  /* Ejecuta el reporte y arma un archivo Excel */
  async exportarXlsx(
    clave: string,
    filtros: Record<string, string | undefined>,
    alcance?: AlcanceResuelto,
  ): Promise<{ buffer: Buffer; nombreArchivo: string }> {
    const def = this.requerir(clave);
    const conAlcance = this.aplicarAlcance(
      clave,
      filtros,
      REPORTES_CON_ALCANCE_UNIDAD,
      alcance,
    );
    const resultado = await def.ejecutar({ prisma: this.prisma, filtros: conAlcance });
    return { buffer: await this.construirLibro(resultado), nombreArchivo: `${def.clave}.xlsx` };
  }

  // Reportes personalizados.

  /* Fuentes de información disponible para armar reportes personalizados. */
  async listarFuentes(): Promise<FuenteCatalogo[]> {
    return Promise.all(
      [...this.fuentes.values()].map(async ({ consultar: _c, ...meta }) => ({
        ...meta,
        filtros: await Promise.all(meta.filtros.map((f) => this.resolverParametro(f))),
      })),
    );
  }

  async previewCustom(
    dto: CustomReporteDto,
    alcance?: AlcanceResuelto,
  ): Promise<ResultadoReporte> {
    const fuente = this.fuentes.get(dto.fuente);
    if (!fuente) throw new NotFoundException(`Fuente '${dto.fuente}' no encontrada`);

    const validas = new Set(fuente.columnas.map((c) => c.clave));
    const pedidas = (dto.columnas ?? []).filter((c) => validas.has(c));
    const columnas = (pedidas.length ? pedidas : fuente.columnas.map((c) => c.clave)).map(
      (clave) => fuente.columnas.find((c) => c.clave === clave)!,
    );

    const filtros = this.aplicarAlcance(
      dto.fuente,
      dto.filtros ?? {},
      FUENTES_CON_ALCANCE_UNIDAD,
      alcance,
    );

    const filas = await fuente.consultar(this.prisma, filtros);
    return { columnas, filas };
  }

  async exportarCustom(
    dto: CustomReporteDto,
    alcance?: AlcanceResuelto,
  ): Promise<{ buffer: Buffer; nombreArchivo: string }> {
    const resultado = await this.previewCustom(dto, alcance);
    return {
      buffer: await this.construirLibro(resultado),
      nombreArchivo: `${dto.fuente}-personalizado.xlsx`,
    };
  }

  private async construirLibro(resultado: ResultadoReporte): Promise<Buffer> {
    const wb = new Workbook();
    const usados = new Set<string>();

    const secciones: SeccionReporte[] = resultado.secciones ?? [
      { titulo: 'Reporte', columnas: resultado.columnas ?? [], filas: resultado.filas ?? [] },
    ];
    for (const seccion of secciones) {
      this.agregarHoja(wb, this.nombreHoja(seccion.titulo, usados), seccion.columnas, seccion.filas);
    }

    if (resultado.resumen?.length) {
      this.agregarHoja(
        wb,
        this.nombreHoja('Resumen', usados),
        [
          { clave: 'indicador', etiqueta: 'Indicador' },
          { clave: 'valor', etiqueta: 'Valor' },
        ],
        resultado.resumen.map((r) => ({ indicador: r.etiqueta, valor: r.valor })),
      );
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // Internos

  private requerir(clave: string): DefinicionReporte {
    const def = this.registro.get(clave);
    if (!def) throw new NotFoundException(`Reporte '${clave}' no encontrado`);
    return def;
  }

  private agregarHoja(
    wb: Workbook,
    nombre: string,
    columnas: ColumnaReporte[],
    filas: Record<string, unknown>[],
  ): void {
    const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });

    ws.columns = columnas.map((c) => {
      const maxContenido = filas.reduce((max, fila) => {
        const v = fila[c.clave];
        return Math.max(max, v === null || v === undefined ? 0 : String(v).length);
      }, c.etiqueta.length);
      return { key: c.clave, width: Math.min(Math.max(maxContenido + 2, 10), 50) };
    });

    const header = ws.addRow(columnas.map((c) => c.etiqueta));
    header.height = 20;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132744' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = this.bordeFino();
    });

    for (const fila of filas) {
      const row = ws.addRow(
        columnas.map((c) => {
          const v = fila[c.clave];
          return v === null || v === undefined ? '' : (v as string | number);
        }),
      );
      row.eachCell((cell, col) => {
        cell.border = this.bordeFino();
        const tipo = columnas[col - 1]?.tipo;
        if (tipo === 'numero' || tipo === 'porcentaje') {
          cell.alignment = { horizontal: 'right' };
        }
      });
    }
  }

  private bordeFino(): Partial<Borders> {
    const color = { argb: 'FFDBE2EC' };
    return {
      top: { style: 'thin', color },
      left: { style: 'thin', color },
      bottom: { style: 'thin', color },
      right: { style: 'thin', color },
    };
  }

  private nombreHoja(titulo: string, usados: Set<string>): string {
    const base = titulo.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Hoja';
    let nombre = base;
    let i = 2;
    while (usados.has(nombre)) {
      nombre = `${base.slice(0, 28)}_${i++}`;
    }
    usados.add(nombre);
    return nombre;
  }

  private async resolverParametro(param: ParametroReporte): Promise<ParametroReporte> {
    if (!param.fuenteOpciones) return param;
    const opciones = await this.resolverFuente(param.fuenteOpciones);
    return { ...param, opciones };
  }

  private async resolverFuente(fuente: string): Promise<OpcionParametro[]> {
    switch (fuente) {
      case 'unidades': {
        const unidades = await this.prisma.unidades.findMany({
          where: { vigente: true },
          select: { id: true, denominacion: true },
          orderBy: { denominacion: 'asc' },
        });
        return unidades.map((u) => ({ valor: u.id.toString(), etiqueta: u.denominacion }));
      }
      case 'personas': {
        const personas = await this.prisma.personas.findMany({
          select: { id: true, cedula: true, primer_nombre: true, primer_apellido: true },
          orderBy: [{ primer_apellido: 'asc' }, { primer_nombre: 'asc' }],
        });
        return personas.map((p) => ({
          valor: p.id.toString(),
          etiqueta: `${p.primer_apellido}, ${p.primer_nombre} (${p.cedula})`,
        }));
      }
      default:
        return [];
    }
  }
}

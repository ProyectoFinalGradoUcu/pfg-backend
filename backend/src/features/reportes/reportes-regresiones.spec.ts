import { fichaPersonalReporte } from './definiciones/ficha-personal.reporte';
import { resumenFuerzaEfectivaReporte } from './definiciones/resumen-fuerza-efectiva.reporte';
import { porcentajeMujeresReporte } from './definiciones/porcentaje-mujeres.reporte';
import { ReportesService } from './reportes.service';
import { FILTRO_ALCANCE_BASES } from './alcance-reportes';
import { misionesFuente } from './custom/misiones.fuente';
import { ascensosFuente } from './custom/ascensos.fuente';

describe('Reportes: regresiones QA', () => {
  const alcance = { tipo: 'unidad' as const, subUnidadIds: ['7'], comandoIds: ['1'] };
  it('habilita Destinos y Legajo del Oficial en el catálogo', () => {
    const claves = new ReportesService({} as any).listar().map(r => r.clave);
    expect(claves).toEqual(expect.arrayContaining(['destinos', 'legajo-oficial']));
  });
  it('lee hijos de vínculos de Personal en ambos sentidos sin duplicar ni usar dependientes', async () => {
    const padre = { id: 1n };
    const hija = { id: 2n, primer_nombre: 'Ana', primer_apellido: 'Pérez' };
    const prisma: any = {
      personas: { findFirst: jest.fn().mockResolvedValue({ ...padre, primer_nombre: 'Juan' }) },
      relaciones_familiares: { findMany: jest.fn().mockResolvedValue([
        { persona_id: 1n, personas_relaciones_familiares_persona_idTopersonas: padre, personas_relaciones_familiares_familiar_idTopersonas: hija },
        { persona_id: 2n, personas_relaciones_familiares_persona_idTopersonas: hija, personas_relaciones_familiares_familiar_idTopersonas: padre },
      ]) },
    };
    const resultado = await fichaPersonalReporte.ejecutar({ prisma, filtros: { persona_id: '1', [FILTRO_ALCANCE_BASES]: '7' } });
    expect(resultado.filas?.find(f => f.campo === 'Hijos')).toEqual({ campo: 'Hijos', valor: 'Ana Pérez' });
    expect(prisma.personas.findFirst.mock.calls[0][0].where.relaciones_laborales.some.sub_unidad_id).toEqual({ in: [7n] });
    expect(prisma.personas.findFirst.mock.calls[0][0]).not.toHaveProperty('include.dependientes');
  });
  it('no consulta familiares cuando la persona está fuera de alcance', async () => {
    const prisma: any = { personas: { findFirst: jest.fn().mockResolvedValue(null) }, relaciones_familiares: { findMany: jest.fn() } };
    const resultado = await fichaPersonalReporte.ejecutar({ prisma, filtros: { persona_id: '999', [FILTRO_ALCANCE_BASES]: '7' } });
    expect(resultado.filas).toEqual([]);
    expect(prisma.relaciones_familiares.findMany).not.toHaveBeenCalled();
  });
  it('ambos reportes cuentan personas únicas e incluyen género desconocido y ausencia de grado', async () => {
    const grado = { id: 1n, denominacion: 'Capitán', orden: 1, es_oficial: true, es_subalterno: false };
    const datos = [
      { persona_id: 1n, personas: { genero: 'F' }, grados: grado, grado_reincorporacion_id: null },
      { persona_id: 1n, personas: { genero: 'F' }, grados: grado, grado_reincorporacion_id: null },
      { persona_id: 2n, personas: { genero: null }, grados: grado, grado_reincorporacion_id: 1n },
      { persona_id: 3n, personas: { genero: 'M' }, grados: null, grado_reincorporacion_id: null },
    ];
    const prisma: any = { relaciones_laborales: { findMany: jest.fn().mockResolvedValue(datos) } };
    const resumen = await resumenFuerzaEfectivaReporte.ejecutar({ prisma, filtros: {} });
    const mujeres = await porcentajeMujeresReporte.ejecutar({ prisma, filtros: {} });
    expect(resumen.resumen?.find(r => r.etiqueta === 'Total efectivos')?.valor).toBe(3);
    expect(mujeres.resumen?.find(r => r.etiqueta === 'Total fuerza efectiva')?.valor).toBe(3);
    expect(resumen.filas?.reduce((n, r) => n + Number(r.total), 0)).toBe(3);
    expect(mujeres.secciones?.flatMap(s => s.filas).reduce((n, r) => n + Number(r.total), 0)).toBe(3);
    expect(resumen.filas?.find(r => r.grado === 'Capitán')?.total).toBe(2);
    expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].where).toMatchObject({ estado: 'activo', fecha_fin: null });
  });
  it('filtra selectores de personas y bases tanto en definiciones como en fuentes custom', async () => {
    const prisma: any = {
      personas: { findMany: jest.fn().mockResolvedValue([]) },
      sub_unidades: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportesService(prisma);
    await service.obtenerDefinicion('ficha-personal', alcance);
    await service.listarFuentes(alcance);
    expect(prisma.personas.findMany.mock.calls.every(([q]) => q.where.relaciones_laborales.some.sub_unidad_id.in[0] === 7n)).toBe(true);
    expect(prisma.sub_unidades.findMany.mock.calls[0][0].where.id).toEqual({ in: [7n] });
  });
  it.each([['misiones', misionesFuente], ['ascensos', ascensosFuente]] as const)('la fuente %s restringe las personas a sus bases', async (_, fuente) => {
    const prisma: any = { funcionarios_convocatorias: { findMany: jest.fn().mockResolvedValue([]) }, ascensos: { findMany: jest.fn().mockResolvedValue([]) } };
    await fuente.consultar(prisma, { [FILTRO_ALCANCE_BASES]: '7' });
    const mock = fuente === misionesFuente ? prisma.funcionarios_convocatorias.findMany : prisma.ascensos.findMany;
    expect(mock.mock.calls[0][0].where.personas.relaciones_laborales.some.sub_unidad_id).toEqual({ in: [7n] });
  });
  it('preview y exportación aplican el mismo filtro de base y descartan el alcance enviado por cliente', async () => {
    const prisma: any = { relaciones_laborales: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ReportesService(prisma);
    await service.ejecutar('resumen-fuerza-efectiva', { [FILTRO_ALCANCE_BASES]: '999' }, alcance);
    const excel = await service.exportarXlsx('resumen-fuerza-efectiva', {}, alcance);
    expect(excel.buffer.length).toBeGreaterThan(0);
    expect(prisma.relaciones_laborales.findMany.mock.calls.map(([q]) => q.where.sub_unidad_id)).toEqual([{ in: [7n] }, { in: [7n] }]);
  });
});

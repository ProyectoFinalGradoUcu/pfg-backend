import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Workbook } from 'exceljs';
import { VuelosService, etiquetaPeriodo, nombrePlanilla, totalHoras } from './vuelos.service';
import { PrismaService } from '../../lib/prisma.service';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types';

const GLOBAL: AlcanceResuelto = { tipo: 'global' };
const dec = (n: number) => new Prisma.Decimal(n);

// ─── Factories ────────────────────────────────────────────────────────────────

const makePeriodo = (overrides: Partial<any> = {}) => ({
  id: 10n,
  anio: 2026,
  numero: 3,
  cerrado: false,
  creado_en: new Date('2026-07-01T00:00:00Z'),
  usuario_id: null,
  ...overrides,
});

const makePersona = (overrides: Partial<any> = {}) => ({
  id: 100n,
  cedula: '12345678',
  primer_nombre: 'Juan',
  segundo_nombre: 'Roberto',
  primer_apellido: 'Pérez',
  segundo_apellido: 'Pérez',
  ...overrides,
});

const makeRegistro = (overrides: Partial<any> = {}) => ({
  id: 500n,
  periodo_id: 10n,
  persona_id: 100n,
  grado_id: 20n,
  escalafon_id: 3n,
  tipo_funcionario: 'oficial',
  unidad_vuelo_id: 9n,
  aeronaves: 'UH-1H, AT-92',
  hs_av_anio_militar: dec(12.5),
  hs_av_total: dec(1500),
  hs_ob_anio_militar: dec(2),
  hs_ob_total: dec(200),
  editado_en: null,
  editado_por: null,
  personas: makePersona(),
  grados: { id: 20n, codigo: 'CNEL', denominacion: 'Cnel.' },
  escalafones: { id: 3n, codigo: 'AV', denominacion: '(Av.)' },
  unidades_vuelo: { id: 9n, denominacion: 'Esc. Aér. 5' },
  periodos_vuelo: makePeriodo(),
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => {
  const mock = {
    periodos_vuelo: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    registros_vuelo: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    relaciones_laborales: { findMany: jest.fn() },
    historial_unidad_vuelo: { create: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    unidades_vuelo: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    personas: { findUnique: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  // Array → Promise.all; callback → se ejecuta con el mismo mock como `tx`.
  mock.$transaction.mockImplementation((arg: any) =>
    typeof arg === 'function' ? arg(mock) : Promise.all(arg),
  );
  return mock;
};

describe('VuelosService', () => {
  let service: VuelosService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [VuelosService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(VuelosService);
  });

  // ─── Helpers puros ──────────────────────────────────────────────────────────

  describe('etiquetaPeriodo', () => {
    it('usa el ordinal de la planilla', () => {
      expect(etiquetaPeriodo({ anio: 2026, numero: 1 })).toBe('1er Período 2026');
      expect(etiquetaPeriodo({ anio: 2026, numero: 2 })).toBe('2do Período 2026');
      expect(etiquetaPeriodo({ anio: 2026, numero: 3 })).toBe('3er Período 2026');
      expect(etiquetaPeriodo({ anio: 2026, numero: 4 })).toBe('4to Período 2026');
    });
  });

  describe('nombrePlanilla', () => {
    it('apellidos en mayúscula y la inicial del segundo nombre', () => {
      expect(nombrePlanilla(makePersona())).toBe('PÉREZ PÉREZ, Juan R.');
    });

    it('sin segundo nombre ni segundo apellido', () => {
      expect(
        nombrePlanilla(makePersona({ segundo_nombre: null, segundo_apellido: null })),
      ).toBe('PÉREZ, Juan');
    });
  });

  describe('totalHoras', () => {
    it('suma las 4 columnas, sin colas de decimales', () => {
      expect(
        totalHoras({ hs_av_anio_militar: dec(0.1), hs_av_total: dec(0.2), hs_ob_anio_militar: 0, hs_ob_total: null }),
      ).toBe(0.3);
      expect(
        totalHoras({ hs_av_anio_militar: 12.5, hs_av_total: 1500, hs_ob_anio_militar: 2, hs_ob_total: 200 }),
      ).toBe(1714.5);
    });
  });

  // ─── Períodos ───────────────────────────────────────────────────────────────

  describe('crearPeriodo', () => {
    it('rechaza un período que ya existe', async () => {
      prisma.periodos_vuelo.findUnique.mockResolvedValue(makePeriodo());

      await expect(service.crearPeriodo({ anio: 2026, numero: 3 }, 1n)).rejects.toThrow(ConflictException);
      expect(prisma.periodos_vuelo.create).not.toHaveBeenCalled();
    });

    it('genera una fila por persona en actividad y arrastra lo del período anterior', async () => {
      prisma.periodos_vuelo.findUnique.mockResolvedValue(null);
      prisma.periodos_vuelo.create.mockResolvedValue(makePeriodo());
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        { persona_id: 100n, grado_id: 20n, escalafon_id: 3n, tipo_funcionario: 'oficial' },
        // Segunda relación abierta de la misma persona, más vieja: se ignora.
        { persona_id: 100n, grado_id: 19n, escalafon_id: 3n, tipo_funcionario: 'oficial' },
        { persona_id: 101n, grado_id: 8n, escalafon_id: 7n, tipo_funcionario: 'subalterno' },
      ]);
      prisma.registros_vuelo.findMany
        .mockResolvedValueOnce([]) // ya en el período
        .mockResolvedValueOnce([
          {
            persona_id: 100n,
            unidad_vuelo_id: 9n,
            aeronaves: 'UH-1H',
            hs_av_anio_militar: dec(12.5),
            hs_av_total: dec(1500),
            hs_ob_anio_militar: dec(2),
            hs_ob_total: dec(200),
            periodos_vuelo: { anio: 2026 },
          },
        ]);
      prisma.registros_vuelo.createMany.mockResolvedValue({ count: 2 });

      const res = await service.crearPeriodo({ anio: 2026, numero: 3 }, 1n);

      expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].where).toEqual({
        fecha_fin: null,
        estado: 'activo',
        tipo_funcionario: { in: ['oficial', 'subalterno'] },
      });
      const { data } = prisma.registros_vuelo.createMany.mock.calls[0][0];
      expect(data).toEqual([
        expect.objectContaining({
          persona_id: 100n,
          grado_id: 20n,
          unidad_vuelo_id: 9n,
          aeronaves: 'UH-1H',
          hs_av_anio_militar: dec(12.5),
          hs_av_total: dec(1500),
        }),
        expect.objectContaining({
          persona_id: 101n,
          tipo_funcionario: 'subalterno',
          unidad_vuelo_id: null,
          hs_av_anio_militar: 0,
          hs_av_total: 0,
        }),
      ]);
      expect(res).toMatchObject({ etiqueta: '3er Período 2026', registros_generados: 2 });
    });

    it('al cambiar de año arrastra los totales pero el año militar arranca en cero', async () => {
      prisma.periodos_vuelo.findUnique.mockResolvedValue(null);
      prisma.periodos_vuelo.create.mockResolvedValue(makePeriodo({ anio: 2027, numero: 1 }));
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        { persona_id: 100n, grado_id: 20n, escalafon_id: 3n, tipo_funcionario: 'oficial' },
      ]);
      prisma.registros_vuelo.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          persona_id: 100n,
          unidad_vuelo_id: 9n,
          aeronaves: null,
          hs_av_anio_militar: dec(40),
          hs_av_total: dec(1540),
          hs_ob_anio_militar: dec(3),
          hs_ob_total: dec(203),
          periodos_vuelo: { anio: 2026 },
        },
      ]);
      prisma.registros_vuelo.createMany.mockResolvedValue({ count: 1 });

      await service.crearPeriodo({ anio: 2027, numero: 1 }, 1n);

      const [fila] = prisma.registros_vuelo.createMany.mock.calls[0][0].data;
      expect(fila).toMatchObject({
        hs_av_anio_militar: 0,
        hs_ob_anio_militar: 0,
        hs_av_total: dec(1540),
        hs_ob_total: dec(203),
      });
    });
  });

  describe('sincronizarPeriodo', () => {
    it('no toca un período cerrado', async () => {
      prisma.periodos_vuelo.findUnique.mockResolvedValue(makePeriodo({ cerrado: true }));

      await expect(service.sincronizarPeriodo(10)).rejects.toThrow(ConflictException);
      expect(prisma.registros_vuelo.createMany).not.toHaveBeenCalled();
    });

    it('solo agrega a quien todavía no está en el período', async () => {
      prisma.periodos_vuelo.findUnique.mockResolvedValue(makePeriodo());
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        { persona_id: 100n, grado_id: 20n, escalafon_id: 3n, tipo_funcionario: 'oficial' },
      ]);
      prisma.registros_vuelo.findMany.mockResolvedValueOnce([{ persona_id: 100n }]);

      const res = await service.sincronizarPeriodo(10);

      expect(res.registros_agregados).toBe(0);
      expect(prisma.registros_vuelo.createMany).not.toHaveBeenCalled();
    });
  });

  describe('listarPeriodos', () => {
    it('cuenta el avance solo de la categoría pedida', async () => {
      prisma.periodos_vuelo.findMany.mockResolvedValue([makePeriodo()]);
      prisma.registros_vuelo.groupBy
        .mockResolvedValueOnce([{ periodo_id: 10n, _count: { _all: 18 } }])
        .mockResolvedValueOnce([{ periodo_id: 10n, _count: { _all: 4 } }]);

      const res = await service.listarPeriodos(GLOBAL, 'subalterno');

      expect(prisma.registros_vuelo.groupBy.mock.calls[0][0].where).toMatchObject({ tipo_funcionario: 'subalterno' });
      expect(prisma.registros_vuelo.groupBy.mock.calls[1][0].where).toMatchObject({
        tipo_funcionario: 'subalterno',
        editado_en: { not: null },
      });
      expect(res[0]).toMatchObject({ total_registros: 18, registros_editados: 4 });
    });
  });

  describe('eliminarPeriodo', () => {
    it('no se puede si ya hay registros cargados', async () => {
      prisma.periodos_vuelo.findUnique.mockResolvedValue(makePeriodo());
      prisma.registros_vuelo.count.mockResolvedValue(3);

      await expect(service.eliminarPeriodo(10)).rejects.toThrow(ConflictException);
      expect(prisma.periodos_vuelo.delete).not.toHaveBeenCalled();
    });

    it('borra las filas generadas y el período', async () => {
      prisma.periodos_vuelo.findUnique.mockResolvedValue(makePeriodo());
      prisma.registros_vuelo.count.mockResolvedValue(0);

      await expect(service.eliminarPeriodo(10)).resolves.toEqual({ id: '10', eliminado: true });
      expect(prisma.registros_vuelo.deleteMany).toHaveBeenCalledWith({ where: { periodo_id: 10n } });
    });
  });

  // ─── Registros ──────────────────────────────────────────────────────────────

  describe('listarRegistros', () => {
    beforeEach(() => {
      prisma.periodos_vuelo.findUnique.mockResolvedValue(makePeriodo());
      prisma.registros_vuelo.count.mockResolvedValue(1);
      prisma.registros_vuelo.groupBy.mockResolvedValue([
        { tipo_funcionario: 'oficial', _count: { _all: 1 } },
      ]);
      prisma.registros_vuelo.aggregate.mockResolvedValue({
        _sum: { hs_av_anio_militar: null, hs_av_total: null, hs_ob_anio_militar: null, hs_ob_total: null },
      });
    });

    it('aplica los filtros sobre lo que tenía al abrirse el período y el alcance de unidad', async () => {
      prisma.registros_vuelo.findMany.mockResolvedValue([]);

      await service.listarRegistros(
        10,
        { query: 'perez', categoria: 'oficial', grado_id: 20, escalafon_id: 3, unidad_vuelo_id: 9 },
        { tipo: 'unidad', unidadIds: ['4'] },
      );

      const { where } = prisma.registros_vuelo.findMany.mock.calls[0][0];
      expect(where).toMatchObject({
        periodo_id: 10n,
        tipo_funcionario: 'oficial',
        grado_id: 20n,
        escalafon_id: 3n,
        unidad_vuelo_id: 9n,
      });
      expect(where.personas.relaciones_laborales).toEqual({
        some: { fecha_fin: null, unidad_id: { in: [4n] } },
      });
      expect(where.personas.OR).toHaveLength(5);
    });

    it('sin_unidad gana sobre unidad_vuelo_id', async () => {
      prisma.registros_vuelo.findMany.mockResolvedValue([]);

      await service.listarRegistros(10, { sin_unidad: true, unidad_vuelo_id: 9 }, GLOBAL);

      expect(prisma.registros_vuelo.findMany.mock.calls[0][0].where.unidad_vuelo_id).toBeNull();
    });

    it('el total de cada fila es la suma de las 4 columnas', async () => {
      prisma.registros_vuelo.findMany.mockResolvedValue([makeRegistro()]);

      const res = await service.listarRegistros(10, {}, GLOBAL);

      expect(res.items[0]).toMatchObject({
        periodo: '3er Período 2026',
        total: 1714.5,
        persona: expect.objectContaining({ nombre_completo: 'PÉREZ PÉREZ, Juan R.' }),
      });
    });

    it('el estado filtra la tabla pero no las pestañas ni el resumen del período', async () => {
      prisma.registros_vuelo.findMany.mockResolvedValue([]);
      prisma.registros_vuelo.count
        .mockResolvedValueOnce(27) // filtrado (pendientes)
        .mockResolvedValueOnce(28) // todos, sin estado
        .mockResolvedValueOnce(1) // cargados, sin estado
        .mockResolvedValueOnce(1); // cargados del período
      prisma.registros_vuelo.groupBy.mockResolvedValue([
        { tipo_funcionario: 'oficial', _count: { _all: 10 } },
        { tipo_funcionario: 'subalterno', _count: { _all: 18 } },
      ]);
      prisma.registros_vuelo.aggregate.mockResolvedValue({
        _sum: { hs_av_anio_militar: dec(10.2), hs_av_total: dec(0.5), hs_ob_anio_militar: dec(0), hs_ob_total: dec(10) },
      });

      const res = await service.listarRegistros(10, { estado: 'pendientes', grado_id: 20 }, GLOBAL);

      const { where } = prisma.registros_vuelo.findMany.mock.calls[0][0];
      expect(where.AND[1]).toEqual({ editado_en: null });
      expect(where.AND[0]).toMatchObject({ grado_id: 20n });
      // El resumen del período no lleva los filtros de la tabla.
      expect(prisma.registros_vuelo.groupBy.mock.calls[0][0].where).not.toHaveProperty('grado_id');
      expect(res.total).toBe(27);
      expect(res.conteos).toEqual({ todos: 28, pendientes: 27, cargados: 1 });
      expect(res.stats).toEqual({ total: 28, cargados: 1, oficiales: 10, subalternos: 18, horas_cargadas: 20.7 });
    });

    it('la categoría sí acota el resumen del período', async () => {
      prisma.registros_vuelo.findMany.mockResolvedValue([]);

      await service.listarRegistros(10, { categoria: 'subalterno' }, GLOBAL);

      expect(prisma.registros_vuelo.groupBy.mock.calls[0][0].where).toMatchObject({ tipo_funcionario: 'subalterno' });
    });
  });

  describe('editarRegistro', () => {
    beforeEach(() => {
      prisma.registros_vuelo.findMany.mockResolvedValue([]);
      prisma.registros_vuelo.update.mockImplementation(({ data }: any) =>
        Promise.resolve(makeRegistro({ ...data })),
      );
    });

    it('404 si no existe', async () => {
      prisma.registros_vuelo.findUnique.mockResolvedValue(null);

      await expect(service.editarRegistro(1, {}, 1n, GLOBAL)).rejects.toThrow(NotFoundException);
    });

    it('no deja editar un período cerrado', async () => {
      prisma.registros_vuelo.findUnique.mockResolvedValue(
        makeRegistro({ periodos_vuelo: makePeriodo({ cerrado: true }) }),
      );

      await expect(service.editarRegistro(500, { hs_av_total: 1600 }, 1n, GLOBAL)).rejects.toThrow(
        ConflictException,
      );
    });

    it('fuera del alcance de unidad da 404', async () => {
      prisma.registros_vuelo.findUnique.mockResolvedValue(makeRegistro());
      prisma.personas.findFirst.mockResolvedValue(null);

      await expect(
        service.editarRegistro(500, { hs_av_total: 1600 }, 1n, { tipo: 'unidad', unidadIds: ['4'] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.registros_vuelo.update).not.toHaveBeenCalled();
    });

    it('las 4 columnas son libres: el año militar puede superar el total', async () => {
      prisma.registros_vuelo.findUnique.mockResolvedValue(makeRegistro());

      await service.editarRegistro(500, { hs_ob_anio_militar: 250 }, 1n, GLOBAL);

      expect(prisma.registros_vuelo.update.mock.calls[0][0].data.hs_ob_anio_militar).toBe(250);
    });

    it('un cambio de unidad queda en el historial con el período', async () => {
      prisma.registros_vuelo.findUnique.mockResolvedValue(makeRegistro());
      prisma.unidades_vuelo.findUnique.mockResolvedValue({ id: 2n, denominacion: 'E.V.B', vigente: true });

      await service.editarRegistro(500, { unidad_vuelo_id: 2 }, 7n, GLOBAL);

      expect(prisma.historial_unidad_vuelo.create).toHaveBeenCalledWith({
        data: {
          persona_id: 100n,
          periodo_id: 10n,
          unidad_anterior_id: 9n,
          unidad_nueva_id: 2n,
          usuario_id: 7n,
        },
      });
      expect(prisma.registros_vuelo.update.mock.calls[0][0].data).toMatchObject({
        unidad_vuelo_id: 2n,
        editado_por: 7n,
      });
    });

    it('sin cambio de unidad no escribe historial', async () => {
      prisma.registros_vuelo.findUnique.mockResolvedValue(makeRegistro());

      await service.editarRegistro(500, { unidad_vuelo_id: 9, aeronaves: '  ' }, 7n, GLOBAL);

      expect(prisma.historial_unidad_vuelo.create).not.toHaveBeenCalled();
      expect(prisma.registros_vuelo.update.mock.calls[0][0].data.aeronaves).toBeNull();
    });

    it('no asigna una unidad dada de baja', async () => {
      prisma.registros_vuelo.findUnique.mockResolvedValue(makeRegistro());
      prisma.unidades_vuelo.findUnique.mockResolvedValue({ id: 2n, denominacion: 'E.V.B', vigente: false });

      await expect(service.editarRegistro(500, { unidad_vuelo_id: 2 }, 7n, GLOBAL)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('historialPersona', () => {
    it('devuelve todos sus períodos del más reciente al más viejo con su total', async () => {
      prisma.personas.findUnique.mockResolvedValue(makePersona());
      prisma.registros_vuelo.findMany.mockResolvedValue([
        makeRegistro({ id: 1n, periodos_vuelo: makePeriodo({ anio: 2025, numero: 4 }) }),
        makeRegistro({ id: 2n, periodos_vuelo: makePeriodo({ anio: 2026, numero: 1, cerrado: true }) }),
      ]);
      prisma.historial_unidad_vuelo.findMany.mockResolvedValue([]);

      const res = await service.historialPersona(100, GLOBAL);

      expect(res.registros.map((r) => [r.periodo, r.total, r.periodo_cerrado])).toEqual([
        ['1er Período 2026', 1714.5, true],
        ['4to Período 2025', 1714.5, false],
      ]);
    });
  });

  describe('exportarAnio', () => {
    it('con categoría filtra cada hoja y la pone en el nombre del archivo', async () => {
      prisma.periodos_vuelo.findMany.mockResolvedValue([makePeriodo()]);
      prisma.registros_vuelo.findMany.mockResolvedValue([]);

      const { nombreArchivo } = await service.exportarAnio(2026, GLOBAL, 'subalterno');

      expect(nombreArchivo).toBe('horas_vuelo_2026_subalternos.xlsx');
      expect(prisma.registros_vuelo.findMany.mock.calls[0][0].where).toMatchObject({ tipo_funcionario: 'subalterno' });
      expect((await service.exportarAnio(2026, GLOBAL, 'oficial')).nombreArchivo).toBe('horas_vuelo_2026_oficiales.xlsx');
    });

    it('sin períodos en el año da 404', async () => {
      prisma.periodos_vuelo.findMany.mockResolvedValue([]);

      await expect(service.exportarAnio(2030, GLOBAL)).rejects.toThrow(NotFoundException);
    });

    it('una hoja por período, con todo su personal y solo el alcance como filtro', async () => {
      prisma.periodos_vuelo.findMany.mockResolvedValue([
        makePeriodo({ id: 1n, numero: 1 }),
        makePeriodo({ id: 2n, numero: 2 }),
      ]);
      prisma.registros_vuelo.findMany
        .mockResolvedValueOnce([makeRegistro(), makeRegistro({ id: 501n, persona_id: 101n })])
        .mockResolvedValueOnce([makeRegistro()]);

      const { buffer, nombreArchivo } = await service.exportarAnio(2026, { tipo: 'unidad', unidadIds: ['4'] });

      expect(nombreArchivo).toBe('horas_vuelo_2026.xlsx');
      expect(prisma.periodos_vuelo.findMany.mock.calls[0][0]).toEqual({ where: { anio: 2026 }, orderBy: { numero: 'asc' } });
      const where = prisma.registros_vuelo.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        periodo_id: 1n,
        personas: { relaciones_laborales: { some: { fecha_fin: null, unidad_id: { in: [4n] } } } },
      });

      const wb = new Workbook();
      await wb.xlsx.load(buffer as any);
      expect(wb.worksheets.map((ws) => [ws.name, ws.rowCount])).toEqual([
        ['1er Período 2026', 3],
        ['2do Período 2026', 2],
      ]);
      expect(wb.worksheets[0].getRow(2).getCell(12).value).toBe(1714.5);
    });
  });

  // ─── Unidades de vuelo ──────────────────────────────────────────────────────

  describe('unidades de vuelo', () => {
    it('no repite una denominación, sin importar mayúsculas', async () => {
      prisma.unidades_vuelo.findFirst.mockResolvedValue({ id: 1n, denominacion: 'E.V.B', vigente: true });

      await expect(service.crearUnidad({ denominacion: 'e.v.b' })).rejects.toThrow(ConflictException);
      expect(prisma.unidades_vuelo.findFirst.mock.calls[0][0].where.denominacion).toEqual({
        equals: 'e.v.b',
        mode: 'insensitive',
      });
    });

    it('al renombrar se compara contra las demás', async () => {
      prisma.unidades_vuelo.findUnique.mockResolvedValue({ id: 1n, denominacion: 'EVB', vigente: true });
      prisma.unidades_vuelo.findFirst.mockResolvedValue(null);
      prisma.unidades_vuelo.update.mockResolvedValue({ id: 1n, denominacion: 'E.V.B', vigente: true });

      await expect(service.editarUnidad(1, { denominacion: 'E.V.B' })).resolves.toEqual({
        id: '1',
        denominacion: 'E.V.B',
        vigente: true,
      });
      expect(prisma.unidades_vuelo.findFirst.mock.calls[0][0].where.id).toEqual({ not: 1n });
    });
  });
});

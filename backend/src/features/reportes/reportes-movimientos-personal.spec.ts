import { movimientosPersonalReporte } from './definiciones/movimientos-personal.reporte';
import { FILTRO_ALCANCE_BASES } from './alcance-reportes';

// Reporte Altas, Ascensos, Bajas y Retiros.

const persona = (cedula: string, nombre = 'Juan') => ({
  cedula,
  primer_nombre: nombre,
  segundo_nombre: null,
  primer_apellido: 'Pérez',
  segundo_apellido: null,
  email: `${cedula}@fau.mil.uy`,
});

const makeRelacion = (overrides: Partial<any> = {}) => ({
  id: 10n,
  persona_id: 1n,
  fecha_inicio: new Date('2025-03-01'),
  fecha_fin: null,
  personas: persona('11111111'),
  grados: { denominacion: 'Sgto.' },
  unidades: { denominacion: 'C.A.O.' },
  sub_unidades: { denominacion: 'B.A.I.' },
  regimenes: { numero_ley: '19.695' },
  motivos_baja: null,
  ...overrides,
});

describe('Reporte · Altas, Ascensos, Bajas y Retiros', () => {
  let candidatas: any[];
  let historial: any[];
  let bajas: any[];

  const prisma: any = {
    relaciones_laborales: { findMany: jest.fn() },
    ascensos: { findMany: jest.fn() },
    retiros: { findMany: jest.fn() },
    movimientos_laborales: { findMany: jest.fn() },
  };

  // El mismo findMany se usa para las candidatas, el historial y las bajas.
  const llamadas = () => prisma.relaciones_laborales.findMany.mock.calls.map((c: any[]) => c[0]);
  const llamadaCandidatas = () => llamadas().find((a: any) => a.include && !a.where?.motivo_baja_id);
  const llamadaBajas = () => llamadas().find((a: any) => a.where?.motivo_baja_id);
  const seccion = async (titulo: string, filtros: Record<string, string | undefined> = {}) => {
    const r = await movimientosPersonalReporte.ejecutar({ prisma, filtros });
    return r.secciones!.find((s) => s.titulo.includes(titulo))!;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    candidatas = [];
    historial = [];
    bajas = [];
    prisma.relaciones_laborales.findMany.mockImplementation(async (args: any) => {
      if (args.where?.motivo_baja_id) return bajas;
      if (args.select) return historial;
      return candidatas;
    });
    prisma.ascensos.findMany.mockResolvedValue([]);
    prisma.retiros.findMany.mockResolvedValue([]);
    prisma.movimientos_laborales.findMany.mockResolvedValue([]);
  });

  describe('altas por ingreso', () => {
    it('la primera relación laboral de cada persona es un alta por ingreso', async () => {
      candidatas = [makeRelacion({ id: 10n, persona_id: 1n })];
      historial = [{ id: 10n, persona_id: 1n }];

      const altas = await seccion('Altas');

      expect(altas.filas).toEqual([
        {
          cedula: '11111111',
          grado: 'Sgto.',
          nombre: 'Juan',
          apellido: 'Pérez',
          fecha: '01/03/2025',
          causal: 'Alta por ingreso',
          base: 'B.A.I.',
          comando: 'C.A.O.',
          correo: '11111111@fau.mil.uy',
          ley: '19.695',
        },
      ]);
    });

    it('no cuenta como alta una relación que no es la primera', async () => {
      // Ya tenía la relación 5, así que la 10 no es un ingreso.
      candidatas = [makeRelacion({ id: 10n, persona_id: 1n })];
      historial = [
        { id: 5n, persona_id: 1n },
        { id: 10n, persona_id: 1n },
      ];

      const altas = await seccion('Altas');

      expect(altas.filas).toEqual([]);
    });

    it('a igual fecha de inicio toma la de menor id', async () => {
      candidatas = [
        makeRelacion({ id: 11n, persona_id: 1n }),
        makeRelacion({ id: 10n, persona_id: 1n }),
      ];
      historial = [
        { id: 10n, persona_id: 1n },
        { id: 11n, persona_id: 1n },
      ];

      const altas = await seccion('Altas');

      expect(altas.filas).toHaveLength(1);
      const consultaHistorial = llamadas().find((a: any) => a.select);
      expect(consultaHistorial.orderBy).toEqual([{ fecha_inicio: 'asc' }, { id: 'asc' }]);
    });

    it('no lee las altas de movimientos_laborales', async () => {
      await movimientosPersonalReporte.ejecutar({ prisma, filtros: {} });

      expect(prisma.movimientos_laborales.findMany).not.toHaveBeenCalled();
    });

    it('aplica el rango de fechas, el alcance por base y la categoría a las candidatas', async () => {
      await movimientosPersonalReporte.ejecutar({
        prisma,
        filtros: {
          desde: '2025-01-01',
          hasta: '2025-12-31',
          categoria: 'subalterno',
          [FILTRO_ALCANCE_BASES]: '3,4',
        },
      });

      expect(llamadaCandidatas().where).toEqual({
        fecha_inicio: { gte: new Date('2025-01-01'), lte: new Date('2025-12-31') },
        sub_unidad_id: { in: [3n, 4n] },
        tipo_funcionario: 'subalterno',
      });
    });

    it('sin candidatas no consulta el historial', async () => {
      await movimientosPersonalReporte.ejecutar({ prisma, filtros: {} });

      expect(llamadas().some((a: any) => a.select)).toBe(false);
    });
  });

  describe('bajas', () => {
    it('no repite en Bajas las relaciones que cerró un retiro', async () => {
      await movimientosPersonalReporte.ejecutar({ prisma, filtros: {} });

      expect(llamadaBajas().where).toMatchObject({
        motivo_baja_id: { not: null },
        retiros: { none: { anulado: false } },
      });
    });

    it('lista la baja con su motivo', async () => {
      bajas = [
        makeRelacion({
          fecha_fin: new Date('2025-08-31'),
          motivos_baja: { denominacion: 'Baja por término de contrato.' },
        }),
      ];

      const seccionBajas = await seccion('Bajas');

      expect(seccionBajas.filas).toEqual([
        expect.objectContaining({ fecha: '31/08/2025', causal: 'Baja por término de contrato.' }),
      ]);
    });
  });

  it('el resumen cuenta cada sección por separado', async () => {
    candidatas = [makeRelacion({ id: 10n, persona_id: 1n })];
    historial = [{ id: 10n, persona_id: 1n }];
    bajas = [makeRelacion({ id: 20n, fecha_fin: new Date('2025-08-31') })];
    prisma.retiros.findMany.mockResolvedValue([
      {
        fecha_retiro: new Date('2025-09-30'),
        motivo: 'Retiro voluntario',
        personas: persona('22222222', 'Ana'),
        relaciones_laborales: makeRelacion({ id: 30n }),
      },
    ]);

    const r = await movimientosPersonalReporte.ejecutar({ prisma, filtros: {} });

    expect(r.resumen).toEqual([
      { etiqueta: 'Altas', valor: 1 },
      { etiqueta: 'Ascensos', valor: 0 },
      { etiqueta: 'Bajas', valor: 1 },
      { etiqueta: 'Retiros', valor: 1 },
    ]);
  });
});

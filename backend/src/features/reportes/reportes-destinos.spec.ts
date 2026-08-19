import { destinosFuente } from './custom/destinos.fuente';
import { destinosReporte } from './definiciones/destinos.reporte';
import { legajoOficialReporte } from './definiciones/legajo-oficial.reporte';

// Los tres leen `destinos` (antes `asignaciones_funcionario`) y toman la unidad
// de la relación `unidades`, no de un catálogo propio. El número de orden vive
// en la asignación, no en el lugar.

const makeUnidad = (overrides: Partial<any> = {}) => ({
  id: 5n,
  codigo: 'EMGFA',
  denominacion: 'E.M.G.F.A.',
  tipo: 'Organismo',
  vigente: true,
  ...overrides,
});

const makeDestino = (overrides: Partial<any> = {}) => ({
  id: 200n,
  persona_id: 100n,
  unidad_id: 5n,
  fecha_inicio: new Date('2024-04-30'),
  fecha_fin: null,
  posicion_destino: 'Sub-Jefe de Personal A-1',
  numero_orden: 'O.D. 11760',
  boletin: null,
  observaciones: null,
  unidades: makeUnidad(),
  personas: {
    cedula: '50000001',
    primer_nombre: 'José',
    segundo_nombre: 'María',
    primer_apellido: 'Pérez',
    segundo_apellido: 'Gómez',
    relaciones_laborales: [
      {
        estado: 'activo',
        grados: { denominacion: 'Coronel' },
        escalafones: { codigo: 'CG' },
      },
    ],
  },
  ...overrides,
});

describe('Fuente custom · destinos', () => {
  const prisma: any = { destinos: { findMany: jest.fn() } };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.destinos.findMany.mockResolvedValue([]);
  });

  it('lee de la tabla destinos incluyendo la unidad', async () => {
    await destinosFuente.consultar(prisma, {});

    expect(prisma.destinos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ unidades: true }),
      }),
    );
  });

  it('toma el destino y el tipo de la unidad, y la orden de la asignación', async () => {
    prisma.destinos.findMany.mockResolvedValue([makeDestino()]);

    const [fila] = await destinosFuente.consultar(prisma, {});

    expect(fila).toEqual({
      cedula: '50000001',
      apellido: 'Pérez Gómez',
      nombre: 'José María',
      grado: 'Coronel',
      destino: 'E.M.G.F.A.',
      tipo_destino: 'Organismo',
      cargo: 'Sub-Jefe de Personal A-1',
      fecha_destino: '30/04/2024',
      fecha_fin: '',
      numero_orden: 'O.D. 11760',
    });
  });

  it('expone la fecha de fin de los destinos cerrados', async () => {
    prisma.destinos.findMany.mockResolvedValue([
      makeDestino({ fecha_fin: new Date('2026-08-31') }),
    ]);

    const [fila] = await destinosFuente.consultar(prisma, {});

    expect(fila.fecha_fin).toBe('31/08/2026');
  });

  it('filtra por funcionario cuando viene persona_id', async () => {
    await destinosFuente.consultar(prisma, { persona_id: '100' });

    expect(prisma.destinos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { persona_id: 100n } }),
    );
  });

  it('no filtra por funcionario cuando no viene persona_id', async () => {
    await destinosFuente.consultar(prisma, {});

    expect(prisma.destinos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('tolera filas sin unidad ni persona', async () => {
    prisma.destinos.findMany.mockResolvedValue([
      makeDestino({ unidades: null, personas: null }),
    ]);

    const [fila] = await destinosFuente.consultar(prisma, {});

    expect(fila.destino).toBe('');
    expect(fila.tipo_destino).toBe('');
    expect(fila.cedula).toBe('');
  });

  it('declara la columna de tipo y la de fecha de fin', () => {
    const claves = destinosFuente.columnas.map((c) => c.clave);

    expect(claves).toContain('tipo_destino');
    expect(claves).toContain('fecha_fin');
  });
});

describe('Reporte · destinos', () => {
  const prisma: any = { destinos: { findMany: jest.fn() } };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.destinos.findMany.mockResolvedValue([]);
  });

  it('arma la fila con la unidad, el escalafón y la orden de la asignación', async () => {
    prisma.destinos.findMany.mockResolvedValue([makeDestino()]);

    const resultado = await destinosReporte.ejecutar({ prisma, filtros: {} });

    expect(resultado.filas).toEqual([
      {
        cedula: '50000001',
        grado: 'Coronel',
        escalafon: 'CG',
        apellido: 'Pérez Gómez',
        nombre: 'José María',
        destino: 'E.M.G.F.A.',
        tipo_destino: 'Organismo',
        cargo: 'Sub-Jefe de Personal A-1',
        fecha_destino: '30/04/2024',
        fecha_fin: '',
        numero_orden: 'O.D. 11760',
      },
    ]);
  });

  it('resume el total de destinos', async () => {
    prisma.destinos.findMany.mockResolvedValue([makeDestino(), makeDestino({ id: 201n })]);

    const resultado = await destinosReporte.ejecutar({ prisma, filtros: {} });

    expect(resultado.resumen).toEqual([{ etiqueta: 'Total destinos', valor: 2 }]);
  });

  it('devuelve las columnas declaradas incluso sin filas', async () => {
    const resultado = await destinosReporte.ejecutar({ prisma, filtros: {} });

    expect(resultado.filas).toEqual([]);
    expect(resultado.columnas?.map((c) => c.clave)).toEqual(
      expect.arrayContaining(['destino', 'tipo_destino', 'fecha_fin', 'numero_orden']),
    );
  });
});

describe('Reporte · legajo del oficial', () => {
  const prisma: any = { personas: { findUnique: jest.fn() } };

  const makePersona = (overrides: Partial<any> = {}) => ({
    id: 100n,
    cedula: '50000001',
    primer_nombre: 'José',
    segundo_nombre: null,
    primer_apellido: 'Pérez',
    segundo_apellido: null,
    genero: 'M',
    fecha_nacimiento: new Date('1980-01-01'),
    lugar_nacimiento: 'Montevideo',
    direccion: null,
    telefono: null,
    relaciones_laborales: [
      {
        estado: 'activo',
        fecha_inicio: new Date('2010-01-01'),
        fecha_fin: null,
        grados: { denominacion: 'Coronel' },
        escalafones: { codigo: 'CG', denominacion: 'Comando' },
        unidades: { denominacion: 'Cuartel General' },
      },
    ],
    destinos: [makeDestino()],
    ascensos: [],
    funcionarios_cursos: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('incluye los destinos con su unidad', async () => {
    prisma.personas.findUnique.mockResolvedValue(makePersona());

    await legajoOficialReporte.ejecutar({ prisma, filtros: { persona_id: '100' } });

    expect(prisma.personas.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          destinos: expect.objectContaining({ include: { unidades: true } }),
        }),
      }),
    );
  });

  it('toma el destino actual de la unidad de la asignación', async () => {
    prisma.personas.findUnique.mockResolvedValue(makePersona());

    const resultado = await legajoOficialReporte.ejecutar({
      prisma,
      filtros: { persona_id: '100' },
    });

    const filas = resultado.secciones?.flatMap((s) => s.filas) ?? [];
    const destinoActual = filas.find((f: any) => f.campo === 'Destino actual');

    expect(destinoActual).toEqual({ campo: 'Destino actual', valor: 'E.M.G.F.A.' });
  });

  it('cae a la unidad de la relación laboral si no hay ninguna asignación', async () => {
    prisma.personas.findUnique.mockResolvedValue(makePersona({ destinos: [] }));

    const resultado = await legajoOficialReporte.ejecutar({
      prisma,
      filtros: { persona_id: '100' },
    });

    const filas = resultado.secciones?.flatMap((s) => s.filas) ?? [];
    const destinoActual = filas.find((f: any) => f.campo === 'Destino actual');

    expect(destinoActual).toEqual({ campo: 'Destino actual', valor: 'Cuartel General' });
  });

  it('devuelve vacío sin persona_id', async () => {
    const resultado = await legajoOficialReporte.ejecutar({ prisma, filtros: {} });

    expect(resultado.secciones).toEqual([]);
    expect(prisma.personas.findUnique).not.toHaveBeenCalled();
  });
});

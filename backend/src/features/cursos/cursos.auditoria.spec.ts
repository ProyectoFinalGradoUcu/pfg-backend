import {
  fotoCurso,
  fotoDesignacion,
  fotoDocumentoDesignacion,
  fotoModuloCurso,
  fotoResultadosCurso,
} from './cursos.auditoria';

const persona = (nombre: string, apellido: string) => ({
  id: 1n,
  primer_nombre: nombre,
  primer_apellido: apellido,
  relaciones_laborales: [{ grados: { denominacion: 'Sargento' } }],
});

const makePrisma = () =>
  ({
    cursos: { findUnique: jest.fn() },
    modulos_curso: { findUnique: jest.fn() },
    funcionarios_cursos: { findUnique: jest.fn() },
  }) as any;

const designacion = {
  numero_orden: '5/2026',
  boletin: null,
  fecha_inicio: new Date('2026-02-01T00:00:00Z'),
  fecha_fin: null,
  aprobado: true,
  calificacion: '8.5',
  observacion_calificacion: null,
  dado_de_baja: false,
  motivo_baja: null,
  fecha_baja: null,
  usuarios: null,
  personas: persona('Juan', 'Pérez'),
  cursos: { nombre_curso: 'Curso de vuelo' },
  archivo_orden: { nombre_original: 'orden.pdf' },
  archivo_boletin: null,
};

describe('fotos de cursos', () => {
  let prisma: ReturnType<typeof makePrisma>;
  beforeEach(() => (prisma = makePrisma()));

  it('curso con base, comando y módulos', async () => {
    prisma.cursos.findUnique.mockResolvedValue({
      nombre_curso: 'Curso de vuelo',
      institucion: 'EMA',
      es_obligatorio: false,
      sub_unidades: { denominacion: 'B.A.I.' },
      unidades: { denominacion: 'C.A.O.' },
      modulos_curso: [{ nombre_modulo: 'Teoría' }, { nombre_modulo: 'Práctica' }],
    });
    expect(await fotoCurso(1n, prisma)).toEqual({
      nombre: 'Curso de vuelo',
      campos: {
        nombre_curso: 'Curso de vuelo',
        institucion: 'EMA',
        es_obligatorio: false,
        sub_unidad: 'B.A.I.',
        comando: 'C.A.O.',
        modulos: ['Teoría', 'Práctica'],
      },
    });
  });

  it('curso inexistente da null', async () => {
    prisma.cursos.findUnique.mockResolvedValue(null);
    expect(await fotoCurso(1n, prisma)).toBeNull();
  });

  it('módulo con su curso', async () => {
    prisma.modulos_curso.findUnique.mockResolvedValue({
      nombre_modulo: 'Teoría',
      orden_modulo: 1,
      descripcion: null,
      cursos: { nombre_curso: 'Curso de vuelo' },
      _count: { funcionarios_modulos_curso: 3 },
    });
    expect(await fotoModuloCurso(2n, prisma)).toEqual({
      nombre: 'Teoría',
      campos: { curso: 'Curso de vuelo', nombre_modulo: 'Teoría', orden_modulo: 1, descripcion: null, completaciones: 3 },
    });
  });

  it('módulo inexistente da null', async () => {
    prisma.modulos_curso.findUnique.mockResolvedValue(null);
    expect(await fotoModuloCurso(2n, prisma)).toBeNull();
  });

  it('designación legible con la nota como número', async () => {
    prisma.funcionarios_cursos.findUnique.mockResolvedValue({ ...designacion, usuarios: { username: 'admin' } });
    const foto = await fotoDesignacion(3n, prisma);
    expect(foto!.nombre).toBe('Sargento Juan Pérez en Curso de vuelo');
    expect(foto!.campos).toMatchObject({
      persona: 'Sargento Juan Pérez',
      curso: 'Curso de vuelo',
      calificacion: 8.5,
      aprobado: true,
      dado_de_baja_por: 'admin',
    });
    expect(foto!.campos).not.toHaveProperty('archivo_orden');
  });

  it('designación inexistente da null', async () => {
    prisma.funcionarios_cursos.findUnique.mockResolvedValue(null);
    expect(await fotoDesignacion(3n, prisma)).toBeNull();
  });

  it('resultados del curso por persona', async () => {
    prisma.cursos.findUnique.mockResolvedValue({
      nombre_curso: 'Curso de vuelo',
      funcionarios_cursos: [{ aprobado: false, calificacion: null, observacion_calificacion: 'faltó', personas: persona('Ana', 'Gómez') }],
    });
    expect(await fotoResultadosCurso(1n, prisma)).toEqual({
      nombre: 'Curso de vuelo',
      campos: { 'Sargento Ana Gómez': { calificacion: null, aprobado: 'Reprobado', observacion: 'faltó' } },
    });
  });

  it('resultados de un curso inexistente da null', async () => {
    prisma.cursos.findUnique.mockResolvedValue(null);
    expect(await fotoResultadosCurso(1n, prisma)).toBeNull();
  });

  it('documento de designación', async () => {
    prisma.funcionarios_cursos.findUnique.mockResolvedValue(designacion);
    expect(await fotoDocumentoDesignacion(3n, prisma, { id: '3', slot: 'orden' })).toEqual({
      nombre: 'Sargento Juan Pérez en Curso de vuelo',
      campos: { persona: 'Sargento Juan Pérez', curso: 'Curso de vuelo', documento: 'Orden', archivo: 'orden.pdf' },
    });
  });

  it('documento de designación con el slot vacío da null', async () => {
    prisma.funcionarios_cursos.findUnique.mockResolvedValue(designacion);
    expect(await fotoDocumentoDesignacion(3n, prisma, { id: '3', slot: 'boletin' })).toBeNull();
  });
});

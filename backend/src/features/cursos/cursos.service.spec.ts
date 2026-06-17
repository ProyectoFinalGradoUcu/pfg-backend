import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CursosService } from './cursos.service';
import { PrismaService } from '../../lib/prisma.service';
import { CursoDto } from './dto/curso.dto';
import { CreateDesignacionDto } from './dto/create-designacion.dto';
import { UpdateDesignacionDto } from './dto/update-designacion.dto';
import { CreateModuloCursoDto } from './dto/create-modulo-curso.dto';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeCurso = (overrides: Partial<any> = {}) => ({
  id: 1n,
  nombre_curso: 'Curso de Aviación',
  institucion: 'EMA',
  es_obligatorio: true,
  modulos_curso: [],
  ...overrides,
});

const makeModulo = (overrides: Partial<any> = {}) => ({
  id: 1n,
  curso_id: 1n,
  nombre_modulo: 'Módulo 1',
  orden_modulo: 1,
  descripcion: 'Descripción del módulo',
  ...overrides,
});

const makePersona = (overrides: Partial<any> = {}) => ({
  id: 10n,
  cedula: '12345678',
  primer_nombre: 'Juan',
  segundo_nombre: null,
  primer_apellido: 'Pérez',
  segundo_apellido: null,
  ...overrides,
});

const makeInscripcion = (overrides: Partial<any> = {}) => ({
  id: 1n,
  persona_id: 10n,
  curso_id: 1n,
  numero_orden: 'ORD-001',
  boletin: null,
  fecha_inicio: new Date('2026-01-01'),
  fecha_fin: new Date('2026-06-30'),
  calificacion: null,
  personas: makePersona(),
  cursos: {
    id: 1n,
    nombre_curso: 'Curso de Aviación',
    institucion: 'EMA',
    es_obligatorio: true,
  },
  modulos: [],
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  cursos: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  modulos_curso: {
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  funcionarios_cursos: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
  },
  funcionarios_modulos_curso: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CursosService', () => {
  let service: CursosService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    // Handles both: callback form (async tx => ...) and array form ([p1, p2])
    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CursosService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CursosService>(CursosService);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea un curso con nombre, institución y tipo correctos', async () => {
      prisma.cursos.findFirst.mockResolvedValue(null);
      prisma.cursos.create.mockResolvedValue(makeCurso());

      const result = await service.create({
        nombre_curso: 'Curso de Aviación',
        institucion: 'EMA',
        es_obligatorio: true,
      });

      expect(result.id).toBe('1');
      expect(result.nombre_curso).toBe('Curso de Aviación');
      expect(result.institucion).toBe('EMA');
      expect(result.es_obligatorio).toBe(true);
    });

    it('usa es_obligatorio = true por defecto cuando no se provee', async () => {
      prisma.cursos.findFirst.mockResolvedValue(null);
      prisma.cursos.create.mockResolvedValue(makeCurso({ es_obligatorio: true }));

      await service.create({ nombre_curso: 'Curso Básico', institucion: 'EMA' });

      expect(prisma.cursos.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ es_obligatorio: true }),
        }),
      );
    });

    it('lanza ConflictException si el nombre ya existe', async () => {
      prisma.cursos.findFirst.mockResolvedValue(makeCurso());

      await expect(
        service.create({ nombre_curso: 'Curso de Aviación', institucion: 'EMA' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    beforeEach(() => {
      prisma.cursos.count.mockResolvedValue(0);
      prisma.cursos.findMany.mockResolvedValue([]);
    });

    it('lista cursos paginados devolviendo total, page y pageSize', async () => {
      prisma.cursos.count.mockResolvedValue(3);
      prisma.cursos.findMany.mockResolvedValue([
        makeCurso({ id: 3n }),
        makeCurso({ id: 2n }),
        makeCurso({ id: 1n }),
      ]);

      const result = await service.findAll({ page: 1, pageSize: 10 });

      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.items).toHaveLength(3);
    });

    it('filtra por nombre parcial e insensible a mayúsculas', async () => {
      prisma.cursos.count.mockResolvedValue(1);
      prisma.cursos.findMany.mockResolvedValue([makeCurso()]);

      await service.findAll({ nombre: 'aviacion' });

      expect(prisma.cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nombre_curso: { contains: 'aviacion', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('filtra por institución (parcial, insensible a mayúsculas)', async () => {
      prisma.cursos.count.mockResolvedValue(1);
      prisma.cursos.findMany.mockResolvedValue([makeCurso()]);

      await service.findAll({ institucion: 'EMA' });

      expect(prisma.cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            institucion: { contains: 'EMA', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('filtra por tipo obligatorio (es_obligatorio = true)', async () => {
      prisma.cursos.count.mockResolvedValue(2);
      prisma.cursos.findMany.mockResolvedValue([makeCurso(), makeCurso({ id: 2n })]);

      await service.findAll({ es_obligatorio: true });

      expect(prisma.cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ es_obligatorio: true }),
        }),
      );
    });

    it('filtra por tipo optativo (es_obligatorio = false)', async () => {
      prisma.cursos.count.mockResolvedValue(1);
      prisma.cursos.findMany.mockResolvedValue([makeCurso({ es_obligatorio: false })]);

      await service.findAll({ es_obligatorio: false });

      expect(prisma.cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ es_obligatorio: false }),
        }),
      );
    });

    it('devuelve todos los cursos cuando no se aplica filtro de tipo', async () => {
      prisma.cursos.count.mockResolvedValue(2);
      prisma.cursos.findMany.mockResolvedValue([
        makeCurso({ es_obligatorio: true }),
        makeCurso({ id: 2n, es_obligatorio: false }),
      ]);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(2);
      // Sin filtro de tipo, el where no incluye es_obligatorio
      expect(prisma.cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('combina filtros de nombre, institución y tipo simultáneamente', async () => {
      prisma.cursos.count.mockResolvedValue(1);
      prisma.cursos.findMany.mockResolvedValue([makeCurso()]);

      await service.findAll({ nombre: 'aviacion', institucion: 'EMA', es_obligatorio: true });

      expect(prisma.cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            nombre_curso: { contains: 'aviacion', mode: 'insensitive' },
            institucion: { contains: 'EMA', mode: 'insensitive' },
            es_obligatorio: true,
          },
        }),
      );
    });

    it('página fuera de rango devuelve array vacío sin lanzar error', async () => {
      prisma.cursos.count.mockResolvedValue(0);
      prisma.cursos.findMany.mockResolvedValue([]);

      const result = await service.findAll({ page: 999, pageSize: 10 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('limita pageSize a un máximo de 100', async () => {
      await service.findAll({ pageSize: 500 });

      expect(prisma.cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  // ─── getById ──────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('obtiene un curso por id incluyendo sus módulos', async () => {
      const modulo = makeModulo();
      prisma.cursos.findUnique.mockResolvedValue(makeCurso({ modulos_curso: [modulo] }));

      const result = await service.getById(1);

      expect(result.id).toBe('1');
      expect(result.modulos_curso).toHaveLength(1);
      expect(result.modulos_curso[0].nombre_modulo).toBe('Módulo 1');
    });

    it('devuelve array vacío de módulos cuando el curso no tiene módulos', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso({ modulos_curso: [] }));

      const result = await service.getById(1);

      expect(result.modulos_curso).toHaveLength(0);
    });

    it('lanza NotFoundException si el curso no existe', async () => {
      prisma.cursos.findUnique.mockResolvedValue(null);

      await expect(service.getById(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── editarCurso ──────────────────────────────────────────────────────────

  describe('editarCurso', () => {
    it('edita nombre, institución y tipo de un curso existente', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.cursos.findFirst.mockResolvedValue(null);
      prisma.cursos.update.mockResolvedValue({
        id: 1n,
        nombre_curso: 'Nuevo Nombre',
        institucion: 'Nueva Institución',
        es_obligatorio: false,
      });

      const result = await service.editarCurso(1, {
        nombre_curso: 'Nuevo Nombre',
        institucion: 'Nueva Institución',
        es_obligatorio: false,
      });

      expect(result.nombre_curso).toBe('Nuevo Nombre');
      expect(result.institucion).toBe('Nueva Institución');
      expect(result.es_obligatorio).toBe(false);
    });

    it('lanza NotFoundException al editar un id inexistente', async () => {
      prisma.cursos.findUnique.mockResolvedValue(null);

      await expect(service.editarCurso(999, { nombre_curso: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('lanza ConflictException si el nuevo nombre ya pertenece a otro curso', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso({ nombre_curso: 'Curso A' }));
      prisma.cursos.findFirst.mockResolvedValue(makeCurso({ id: 2n, nombre_curso: 'Curso B' }));

      await expect(service.editarCurso(1, { nombre_curso: 'Curso B' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── removeCurso ──────────────────────────────────────────────────────────

  describe('removeCurso', () => {
    it('elimina un curso existente', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.funcionarios_cursos.deleteMany.mockResolvedValue({ count: 0 });
      prisma.cursos.delete.mockResolvedValue(makeCurso());

      const result = await service.removeCurso(1);

      expect(result.eliminado).toBe(true);
      expect(result.id).toBe('1');
    });

    it('lanza NotFoundException al eliminar un id inexistente', async () => {
      prisma.cursos.findUnique.mockResolvedValue(null);

      await expect(service.removeCurso(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createModulo ─────────────────────────────────────────────────────────

  describe('createModulo', () => {
    it('agrega módulo con nombre y descripción opcional', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.modulos_curso.create.mockResolvedValue(makeModulo({ descripcion: 'Desc opcional' }));

      const result = await service.createModulo(1, {
        nombre_modulo: 'Módulo 1',
        descripcion: 'Desc opcional',
      });

      expect(result.nombre_modulo).toBe('Módulo 1');
      expect(result.descripcion).toBe('Desc opcional');
      expect(result.curso_id).toBe('1');
    });

    it('agrega módulo sin descripción (null)', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.modulos_curso.create.mockResolvedValue(makeModulo({ descripcion: null }));

      const result = await service.createModulo(1, { nombre_modulo: 'Módulo Sin Desc' });

      expect(result.descripcion).toBeNull();
    });

    it('lanza NotFoundException si el curso no existe', async () => {
      prisma.cursos.findUnique.mockResolvedValue(null);

      await expect(service.createModulo(999, { nombre_modulo: 'M' })).rejects.toThrow(NotFoundException);
    });

    it('lista módulos de un curso: array vacío cuando no tiene módulos', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso({ modulos_curso: [] }));

      const result = await service.getById(1);

      expect(result.modulos_curso).toHaveLength(0);
    });

    it('lista módulos en orden de orden_modulo asc', async () => {
      const modulosOrdenados = [
        makeModulo({ id: 1n, orden_modulo: 1 }),
        makeModulo({ id: 2n, orden_modulo: 2 }),
        makeModulo({ id: 3n, orden_modulo: 3 }),
      ];
      prisma.cursos.findUnique.mockResolvedValue(makeCurso({ modulos_curso: modulosOrdenados }));

      // El servicio pasa orderBy: { orden_modulo: 'asc' } a prisma
      expect(prisma.cursos.findUnique).toBeDefined();

      const result = await service.getById(1);
      expect(result.modulos_curso[0].orden_modulo).toBe(1);
      expect(result.modulos_curso[1].orden_modulo).toBe(2);
      expect(result.modulos_curso[2].orden_modulo).toBe(3);

      expect(prisma.cursos.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            modulos_curso: expect.objectContaining({
              orderBy: { orden_modulo: 'asc' },
            }),
          }),
        }),
      );
    });
  });

  // ─── removeModuloCurso ────────────────────────────────────────────────────

  describe('removeModuloCurso', () => {
    it('elimina un módulo existente del curso', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.modulos_curso.findFirst.mockResolvedValue(makeModulo());
      prisma.funcionarios_modulos_curso.deleteMany.mockResolvedValue({ count: 0 });
      prisma.modulos_curso.delete.mockResolvedValue(makeModulo());

      const result = await service.removeModuloCurso(1, 1);

      expect(result.eliminado).toBe(true);
      expect(result.modulo_id).toBe('1');
      expect(result.curso_id).toBe('1');
    });

    it('lanza NotFoundException si el curso no existe', async () => {
      prisma.cursos.findUnique.mockResolvedValue(null);

      await expect(service.removeModuloCurso(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el módulo no pertenece al curso', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.modulos_curso.findFirst.mockResolvedValue(null);

      await expect(service.removeModuloCurso(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── crearDesignacion ─────────────────────────────────────────────────────

  describe('crearDesignacion', () => {
    const baseDto = {
      persona_ids: [10, 20],
      fecha_inicio: '2026-01-01',
      fecha_fin: '2026-06-30',
    };

    beforeEach(() => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.funcionarios_cursos.upsert.mockResolvedValue({
        id: 1n,
        persona_id: 10n,
        curso_id: 1n,
      });
    });

    it('designa con número de orden válido (sin boletín)', async () => {
      const result = await service.crearDesignacion(1, {
        ...baseDto,
        numero_orden: 'ORD-001',
      });

      expect(result.curso_id).toBe('1');
      expect(result.personas_designadas).toBe(2);
      expect(result.numero_orden).toBe('ORD-001');
      expect(result.boletin).toBeNull();
    });

    it('designa con boletín válido (sin número de orden)', async () => {
      const result = await service.crearDesignacion(1, {
        ...baseDto,
        boletin: 'BOL-2026-04',
      });

      expect(result.boletin).toBe('BOL-2026-04');
      expect(result.numero_orden).toBeNull();
    });

    it('lanza NotFoundException si el curso no existe', async () => {
      prisma.cursos.findUnique.mockResolvedValue(null);

      await expect(
        service.crearDesignacion(999, { ...baseDto, numero_orden: 'ORD-001' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea una inscripción (upsert) por cada persona seleccionada', async () => {
      await service.crearDesignacion(1, {
        ...baseDto,
        persona_ids: [10, 20, 30],
        numero_orden: 'ORD-001',
      });

      expect(prisma.funcionarios_cursos.upsert).toHaveBeenCalledTimes(3);
    });

    it('lanza NotFoundException si algún módulo no pertenece al curso', async () => {
      prisma.modulos_curso.count.mockResolvedValue(0); // módulos inválidos

      await expect(
        service.crearDesignacion(1, {
          ...baseDto,
          modulo_ids: [99],
          numero_orden: 'ORD-001',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getCursosPorFuncionario ───────────────────────────────────────────────

  describe('getCursosPorFuncionario', () => {
    beforeEach(() => {
      prisma.funcionarios_cursos.count.mockResolvedValue(0);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([]);
    });

    it('lista inscripciones paginadas con datos de funcionario y curso', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion()]);

      const result = await service.getCursosPorFuncionario({ page: 1, pageSize: 10 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.items[0].persona.cedula).toBe('12345678');
      expect(result.items[0].curso.nombre_curso).toBe('Curso de Aviación');
    });

    it('filtra por cédula exacta', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion()]);

      await service.getCursosPorFuncionario({ cedula: '12345678' });

      expect(prisma.funcionarios_cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personas: { cedula: '12345678' } },
        }),
      );
    });

    it('devuelve calificacion como número cuando fue cargada', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion({ calificacion: '8' })]);

      const result = await service.getCursosPorFuncionario({});

      expect(result.items[0].calificacion).toBe(8);
    });

    it('devuelve calificacion como null cuando no fue cargada', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion({ calificacion: null })]);

      const result = await service.getCursosPorFuncionario({});

      expect(result.items[0].calificacion).toBeNull();
    });

    it('devuelve array vacío cuando no hay inscripciones', async () => {
      const result = await service.getCursosPorFuncionario({});

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('calcula el contador "Cursos Completados" — inscripciones con calificacion no nula', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(3);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, calificacion: '8' }),
        makeInscripcion({ id: 2n, calificacion: '7' }),
        makeInscripcion({ id: 3n, calificacion: null }),
      ]);

      const result = await service.getCursosPorFuncionario({});
      const completados = result.items.filter((i) => i.calificacion !== null).length;

      expect(completados).toBe(2);
    });

    it('calcula el contador "En Curso" — inscripciones sin calificacion', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(2);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, calificacion: null }),
        makeInscripcion({ id: 2n, calificacion: '9' }),
      ]);

      const result = await service.getCursosPorFuncionario({});
      const enCurso = result.items.filter((i) => i.calificacion === null).length;

      expect(enCurso).toBe(1);
    });

    it('calcula el contador "Cursos Obligatorios" — inscripciones con es_obligatorio = true', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(3);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, cursos: { id: 1n, nombre_curso: 'A', institucion: 'EMA', es_obligatorio: true } }),
        makeInscripcion({ id: 2n, cursos: { id: 2n, nombre_curso: 'B', institucion: 'EMA', es_obligatorio: false } }),
        makeInscripcion({ id: 3n, cursos: { id: 3n, nombre_curso: 'C', institucion: 'EMA', es_obligatorio: true } }),
      ]);

      const result = await service.getCursosPorFuncionario({});
      const obligatorios = result.items.filter((i) => i.curso.es_obligatorio).length;

      expect(obligatorios).toBe(2);
    });

    it('obtiene cursos finalizados pendientes de calificación (fecha_fin pasada + sin nota)', async () => {
      const pasada = new Date('2025-01-01');
      const futura = new Date('2099-12-31');

      prisma.funcionarios_cursos.count.mockResolvedValue(3);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, fecha_fin: pasada, calificacion: null }),    // pendiente
        makeInscripcion({ id: 2n, fecha_fin: pasada, calificacion: '7' }),    // ya calificado
        makeInscripcion({ id: 3n, fecha_fin: futura, calificacion: null }),   // aún no finalizado
      ]);

      const ahora = new Date();
      const result = await service.getCursosPorFuncionario({});
      const pendientes = result.items.filter(
        (i) => i.fecha_fin && i.fecha_fin < ahora && i.calificacion === null,
      );

      expect(pendientes).toHaveLength(1);
    });

    it('excluye de pendientes los cursos sin fecha_fin', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, fecha_fin: null, calificacion: null }),
      ]);

      const ahora = new Date();
      const result = await service.getCursosPorFuncionario({});
      const pendientes = result.items.filter(
        (i) => i.fecha_fin && i.fecha_fin < ahora && i.calificacion === null,
      );

      expect(pendientes).toHaveLength(0);
    });

    it('excluye de pendientes los ya calificados', async () => {
      const pasada = new Date('2025-01-01');
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, fecha_fin: pasada, calificacion: '9' }),
      ]);

      const ahora = new Date();
      const result = await service.getCursosPorFuncionario({});
      const pendientes = result.items.filter(
        (i) => i.fecha_fin && i.fecha_fin < ahora && i.calificacion === null,
      );

      expect(pendientes).toHaveLength(0);
    });
  });

  // ─── actualizarDesignacion ────────────────────────────────────────────────

  describe('actualizarDesignacion', () => {
    it('carga una nota válida (1–10) en la designación', async () => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue({
        id: 1n,
        persona_id: 10n,
        curso_id: 1n,
        calificacion: null,
      });
      prisma.funcionarios_cursos.update.mockResolvedValue({
        id: 1n,
        curso_id: 1n,
        persona_id: 10n,
        calificacion: '8',
      });

      const result = await service.actualizarDesignacion(1, 1, { calificacion: 8 });

      expect(result.calificacion).toBe(8);
      expect(result.id).toBe('1');
    });

    it('lanza NotFoundException si la designación no existe', async () => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(null);

      await expect(
        service.actualizarDesignacion(1, 999, { calificacion: 8 }),
      ).rejects.toThrow(NotFoundException);
    });

    it.todo('lanza error si se intenta calificar un curso aún no finalizado (fecha_fin futura)');
    it.todo('calificación masiva: guarda varias notas en una sola operación');
    it.todo('calificación masiva: si una nota es inválida, no guarda ninguna (rollback)');
    it.todo('calificación masiva: el contador de pendientes baja correctamente tras guardar');
  });

  // ─── DTOs ─────────────────────────────────────────────────────────────────

  describe('DTOs', () => {
    describe('CursoDto', () => {
      it('rechaza nombre_curso vacío', async () => {
        const dto = plainToInstance(CursoDto, { nombre_curso: '', institucion: 'EMA' });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'nombre_curso')).toBe(true);
      });

      it('rechaza institución vacía', async () => {
        const dto = plainToInstance(CursoDto, { nombre_curso: 'Curso X', institucion: '' });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'institucion')).toBe(true);
      });

      it('es válido con nombre e institución correctos', async () => {
        const dto = plainToInstance(CursoDto, { nombre_curso: 'Curso X', institucion: 'EMA' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('es válido con es_obligatorio = false (optativo)', async () => {
        const dto = plainToInstance(CursoDto, {
          nombre_curso: 'Curso X',
          institucion: 'EMA',
          es_obligatorio: false,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('CreateModuloCursoDto', () => {
      it('rechaza nombre_modulo vacío', async () => {
        const dto = plainToInstance(CreateModuloCursoDto, { nombre_modulo: '' });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'nombre_modulo')).toBe(true);
      });

      it('es válido con nombre y sin descripción', async () => {
        const dto = plainToInstance(CreateModuloCursoDto, { nombre_modulo: 'Módulo A' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('es válido con nombre y descripción opcionales', async () => {
        const dto = plainToInstance(CreateModuloCursoDto, {
          nombre_modulo: 'Módulo A',
          descripcion: 'Descripción del módulo',
          orden_modulo: 1,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('CreateDesignacionDto — validador "al menos uno: N° Orden o Boletín"', () => {
      const base = {
        persona_ids: [1],
        fecha_inicio: '2026-01-01',
        fecha_fin: '2026-06-30',
      };

      it('es válido con número de orden (sin boletín)', async () => {
        const dto = plainToInstance(CreateDesignacionDto, { ...base, numero_orden: 'ORD-001' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('es válido con boletín (sin número de orden)', async () => {
        const dto = plainToInstance(CreateDesignacionDto, { ...base, boletin: 'BOL-2026-04' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('lanza error si N° Orden y Boletín vienen ambos ausentes', async () => {
        const dto = plainToInstance(CreateDesignacionDto, base);
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });

      it('rechaza si persona_ids está vacío', async () => {
        const dto = plainToInstance(CreateDesignacionDto, {
          ...base,
          persona_ids: [],
          numero_orden: 'ORD-001',
        });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'persona_ids')).toBe(true);
      });
    });

    describe('UpdateDesignacionDto (CargarNotaDto)', () => {
      it('acepta calificación mínima válida (1)', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { calificacion: 1 });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('acepta calificación máxima válida (10)', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { calificacion: 10 });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('rechaza calificación 0 (fuera de rango mínimo)', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { calificacion: 0 });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'calificacion')).toBe(true);
      });

      it('rechaza calificación 11 (fuera de rango máximo)', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { calificacion: 11 });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'calificacion')).toBe(true);
      });

      it('rechaza calificación negativa', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { calificacion: -5 });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'calificacion')).toBe(true);
      });
    });
  });
});

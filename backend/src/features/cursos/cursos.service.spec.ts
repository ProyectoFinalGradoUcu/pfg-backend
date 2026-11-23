import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CursosService } from './cursos.service';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { CursoDto } from './dto/curso.dto';
import { CreateDesignacionDto } from './dto/create-designacion.dto';
import { UpdateDesignacionDto } from './dto/update-designacion.dto';
import { CalificarDesignacionesDto } from './dto/calificar-designaciones.dto';
import { CreateModuloCursoDto } from './dto/create-modulo-curso.dto';
import { UpdateCursoDto } from './dto/update-curso.dto';
import { whereBusqueda } from '../../lib/query/busqueda';

const GLOBAL: AlcanceResuelto = { tipo: 'global' };

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
  relaciones_laborales: [
    { derecha: 4, numor: 2, grados: { denominacion: 'Cap.' }, escalafones: { codigo: 'AV' } },
  ],
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
  aprobado: null,
  calificacion: null,
  observacion_calificacion: null,
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
  sub_unidades: { findUnique: jest.fn() },
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
  relaciones_laborales: { findMany: jest.fn() },
  personas: { findMany: jest.fn() },
  funcionarios_modulos_curso: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CursosService', () => {
  let service: CursosService;
  let prisma: ReturnType<typeof makePrismaMock>;
  const archivos = { eliminar: jest.fn() };

  beforeAll(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CursosService,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();

    service = module.get<CursosService>(CursosService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    archivos.eliminar.mockResolvedValue(undefined);
    prisma.personas.findMany.mockImplementation(({ where }) => Promise.resolve(where.id.in.map((id: bigint) => ({ id }))));
    // Handles both: callback form (async tx => ...) and array form ([p1, p2])
    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });
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

    describe('base del curso', () => {
      const UNA_BASE: AlcanceResuelto = { tipo: 'unidad', subUnidadIds: ['7'], comandoIds: ['2'] };
      const DOS_BASES: AlcanceResuelto = { tipo: 'unidad', subUnidadIds: ['7', '8'], comandoIds: ['2'] };
      const dataCreada = () => prisma.cursos.create.mock.calls[0][0].data;

      beforeEach(() => {
        prisma.cursos.findFirst.mockResolvedValue(null);
        prisma.cursos.create.mockResolvedValue(makeCurso());
        prisma.sub_unidades.findUnique.mockImplementation(({ where }: any) =>
          Promise.resolve({ id: where.id, unidad_id: 2n, vigente: true }),
        );
      });

      it('con alcance global y sin base crea un curso general', async () => {
        await service.create({ nombre_curso: 'X', institucion: 'EMA' }, { tipo: 'global' });

        expect(dataCreada()).toMatchObject({ sub_unidad_id: null, unidad_id: null });
      });

      it('con alcance global puede elegir cualquier base; el comando sale de ella', async () => {
        await service.create({ nombre_curso: 'X', institucion: 'EMA', sub_unidad_id: 9 }, { tipo: 'global' });

        expect(dataCreada()).toMatchObject({ sub_unidad_id: 9n, unidad_id: 2n });
      });

      it('con una sola base y sin elegir, usa esa', async () => {
        await service.create({ nombre_curso: 'X', institucion: 'EMA' }, UNA_BASE);

        expect(dataCreada()).toMatchObject({ sub_unidad_id: 7n, unidad_id: 2n });
      });

      it('con varias bases exige elegir una', async () => {
        await expect(service.create({ nombre_curso: 'X', institucion: 'EMA' }, DOS_BASES)).rejects.toThrow(
          'Elegí la base del curso',
        );
      });

      it('no deja crear un curso en una base ajena', async () => {
        await expect(
          service.create({ nombre_curso: 'X', institucion: 'EMA', sub_unidad_id: 9 }, DOS_BASES),
        ).rejects.toThrow('Solo podés crear cursos de tus propias bases');
        expect(prisma.cursos.create).not.toHaveBeenCalled();
      });

      it('rechaza una base que no está vigente', async () => {
        prisma.sub_unidades.findUnique.mockResolvedValue({ id: 9n, unidad_id: 2n, vigente: false });

        await expect(
          service.create({ nombre_curso: 'X', institucion: 'EMA', sub_unidad_id: 9 }, { tipo: 'global' }),
        ).rejects.toThrow('no está vigente');
      });
    });

    it('lanza ConflictException si el nombre ya existe', async () => {
      prisma.cursos.findFirst.mockResolvedValue(makeCurso());

      await expect(
        service.create({ nombre_curso: 'Curso de Aviación', institucion: 'EMA' }),
      ).rejects.toThrow(ConflictException);
    });

    it('busca el nombre duplicado sin distinguir mayúsculas', async () => {
      prisma.cursos.findFirst.mockResolvedValue(makeCurso());

      await expect(
        service.create({ nombre_curso: 'CURSO DE AVIACIÓN', institucion: 'EMA' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.cursos.findFirst).toHaveBeenCalledWith({
        where: { nombre_curso: { equals: 'CURSO DE AVIACIÓN', mode: 'insensitive' } },
      });
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
            AND: whereBusqueda('aviacion', ['nombre_curso'])!.AND,
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
            AND: whereBusqueda('EMA', ['institucion'])!.AND,
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
            AND: [...whereBusqueda('aviacion', ['nombre_curso'])!.AND, ...whereBusqueda('EMA', ['institucion'])!.AND],
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

    it('busca el nombre duplicado sin distinguir mayúsculas', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso({ nombre_curso: 'Curso A' }));
      prisma.cursos.findFirst.mockResolvedValue(makeCurso({ id: 2n, nombre_curso: 'Curso B' }));

      await expect(service.editarCurso(1, { nombre_curso: 'curso b' })).rejects.toThrow(ConflictException);
      expect(prisma.cursos.findFirst).toHaveBeenCalledWith({
        where: { nombre_curso: { equals: 'curso b', mode: 'insensitive' }, id: { not: 1n } },
      });
    });
  });

  // ─── removeCurso ──────────────────────────────────────────────────────────

  describe('removeCurso', () => {
    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValue([]);
    });

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

    it('removeCurso da de baja los archivos de sus designaciones', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { archivo_orden_id: 7n, archivo_boletin_id: null },
        { archivo_orden_id: null, archivo_boletin_id: 8n },
      ]);
      prisma.funcionarios_cursos.deleteMany.mockResolvedValue({ count: 2 });
      prisma.cursos.delete.mockResolvedValue(makeCurso());

      await service.removeCurso(1);

      expect(prisma.$queryRaw.mock.calls[0][0].join('?')).toMatch(/FROM cursos[\s\S]*FOR UPDATE/);
      expect(prisma.$queryRaw.mock.calls[1][0].join('?')).toContain('FROM funcionarios_cursos');
      expect(prisma.funcionarios_cursos.findMany).not.toHaveBeenCalled();
      expect(archivos.eliminar).toHaveBeenCalledWith(7n, null);
      expect(archivos.eliminar).toHaveBeenCalledWith(8n, null);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.funcionarios_cursos.deleteMany.mock.invocationCallOrder[0],
      );
      expect(archivos.eliminar.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.cursos.delete.mock.invocationCallOrder[0],
      );
    });

    it('si el borrado falla, no da de baja ningún archivo', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.$queryRaw.mockResolvedValue([{ archivo_orden_id: 7n, archivo_boletin_id: null }]);
      prisma.cursos.delete.mockRejectedValue(new Error('FK'));

      await expect(service.removeCurso(1)).rejects.toThrow('FK');
      expect(archivos.eliminar).not.toHaveBeenCalled();
    });

    it('si la baja falla, removeCurso igual responde', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.$queryRaw.mockResolvedValue([{ archivo_orden_id: 7n, archivo_boletin_id: null }]);
      archivos.eliminar.mockRejectedValue(new Error('minio caído'));
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const result = await service.removeCurso(1);

      expect(log).toHaveBeenCalled();
      expect(result).toEqual({ id: '1', eliminado: true });
      log.mockRestore();
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
      prisma.funcionarios_modulos_curso.findMany.mockResolvedValue([]);
      prisma.funcionarios_modulos_curso.deleteMany.mockResolvedValue({ count: 0 });
      prisma.modulos_curso.delete.mockResolvedValue(makeModulo());

      const result = await service.removeModuloCurso(1, 1);

      expect(result.eliminado).toBe(true);
      expect(result.modulo_id).toBe('1');
      expect(result.curso_id).toBe('1');
    });

    it('pasa la orden del módulo a la inscripción que no tiene orden ni resolución', async () => {
      prisma.cursos.findUnique.mockResolvedValue(makeCurso());
      prisma.modulos_curso.findFirst.mockResolvedValue(makeModulo());
      prisma.funcionarios_modulos_curso.findMany.mockResolvedValue([
        { numero_orden: 'O-1', boletin: null, funcionarios_cursos: { id: 5n, numero_orden: null, boletin: null } },
        { numero_orden: 'O-2', boletin: null, funcionarios_cursos: { id: 6n, numero_orden: 'O-6', boletin: null } },
      ]);
      prisma.funcionarios_modulos_curso.deleteMany.mockResolvedValue({ count: 2 });
      prisma.modulos_curso.delete.mockResolvedValue(makeModulo());

      await service.removeModuloCurso(1, 1);

      expect(prisma.funcionarios_cursos.update).toHaveBeenCalledTimes(1);
      expect(prisma.funcionarios_cursos.update).toHaveBeenCalledWith({
        where: { id: 5n },
        data: { numero_orden: 'O-1', boletin: null },
      });
      expect(prisma.modulos_curso.delete).toHaveBeenCalled();
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
      prisma.funcionarios_cursos.create.mockResolvedValue({
        id: 1n,
        persona_id: 10n,
        curso_id: 1n,
      });
    });

    it('designa con número de orden válido (sin resolución)', async () => {
      const result = await service.crearDesignacion(1, {
        ...baseDto,
        numero_orden: 'ORD-001',
      });

      expect(result.curso_id).toBe('1');
      expect(result.personas_designadas).toBe(2);
      expect(result.numero_orden).toBe('ORD-001');
      expect(result.boletin).toBeNull();
    });

    it('designa con resolución válida (sin número de orden)', async () => {
      const result = await service.crearDesignacion(1, {
        ...baseDto,
        boletin: 'RES-2026-04',
      });

      expect(result.boletin).toBe('RES-2026-04');
      expect(result.numero_orden).toBeNull();
    });

    it('lanza NotFoundException si el curso no existe', async () => {
      prisma.cursos.findUnique.mockResolvedValue(null);

      await expect(
        service.crearDesignacion(999, { ...baseDto, numero_orden: 'ORD-001' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza una fecha de fin anterior a la de inicio', async () => {
      await expect(
        service.crearDesignacion(1, {
          ...baseDto,
          numero_orden: 'ORD-001',
          fecha_inicio: '2026-06-30',
          fecha_fin: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.funcionarios_cursos.create).not.toHaveBeenCalled();
    });

    it('acepta inicio y fin el mismo día', async () => {
      const result = await service.crearDesignacion(1, {
        ...baseDto,
        numero_orden: 'ORD-001',
        fecha_inicio: '2026-03-01',
        fecha_fin: '2026-03-01',
      });

      expect(result.personas_designadas).toBe(2);
    });

    it('crea una inscripción por cada persona seleccionada', async () => {
      await service.crearDesignacion(1, {
        ...baseDto,
        persona_ids: [10, 20, 30],
        numero_orden: 'ORD-001',
      });

      expect(prisma.funcionarios_cursos.create).toHaveBeenCalledTimes(3);
    });

    it('devuelve el id de cada designación creada', async () => {
      prisma.funcionarios_cursos.create
        .mockResolvedValueOnce({ id: 101n, persona_id: 10n, curso_id: 1n })
        .mockResolvedValueOnce({ id: 102n, persona_id: 20n, curso_id: 1n });

      const result = await service.crearDesignacion(1, { ...baseDto, numero_orden: 'ORD-001' });

      expect(result.designaciones).toEqual([
        { id: 101n, persona_id: 10n },
        { id: 102n, persona_id: 20n },
      ]);
      expect(result.personas_designadas).toBe(2);
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
      prisma.relaciones_laborales.findMany.mockResolvedValue([]);
    });

    it('incluye la derecha y el numor del funcionario', async () => {
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion()]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);

      expect(result.items[0].persona).toMatchObject({ grado: 'Cap.', escalafon: 'AV', derecha: 4, numor: 2 });
    });

    it('ordena por la derecha de la persona y después por curso, antes de paginar', async () => {
      prisma.funcionarios_cursos.findMany.mockImplementation(({ where }: any) => {
        const filas = [
          makeInscripcion({ id: 1n, persona_id: 10n, curso_id: 2n }),
          makeInscripcion({ id: 2n, persona_id: 20n, curso_id: 1n }),
          makeInscripcion({ id: 3n, persona_id: 10n, curso_id: 1n }),
        ];
        return Promise.resolve(where.id?.in ? filas.filter((f) => where.id.in.includes(f.id)) : filas);
      });
      prisma.relaciones_laborales.findMany.mockResolvedValue([{ persona_id: 20n }, { persona_id: 10n }]);

      const result = await service.getCursosPorFuncionario({ page: 1, pageSize: 2 }, GLOBAL);

      expect(result.items.map((i: any) => i.id)).toEqual(['2', '3']);
      expect(result.total).toBe(3);
    });

    it('filtra por rango de derecha sobre la relación vigente de la persona', async () => {
      await service.getCursosPorFuncionario({ derechaDesde: 1, derechaHasta: 5 }, GLOBAL);

      expect(prisma.funcionarios_cursos.findMany.mock.calls[0][0].where.personas).toEqual({
        relaciones_laborales: { some: { fecha_fin: null, derecha: { gte: 1, lte: 5 } } },
      });
    });

    it('getCursosPorFuncionario devuelve los documentos de cada designación', async () => {
      const orden = { nombre_original: 'o.pdf', content_type: 'application/pdf', tamanio_bytes: 8n, subido_en: new Date() };
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ archivo_orden: orden, archivo_boletin: null }),
      ]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);

      expect(result.items[0].documentos).toEqual({ orden, boletin: null });
      const [ids, filas] = prisma.funcionarios_cursos.findMany.mock.calls.map((c: any[]) => c[0]);
      expect(ids.include).toBeUndefined();
      expect(filas.include).toEqual(
        expect.objectContaining({ archivo_orden: expect.anything(), archivo_boletin: expect.anything() }),
      );
    });

    it('lista inscripciones paginadas con datos de funcionario y curso', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion()]);

      const result = await service.getCursosPorFuncionario({ page: 1, pageSize: 10 }, GLOBAL);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.items[0].persona.cedula).toBe('12345678');
      expect(result.items[0].curso.nombre_curso).toBe('Curso de Aviación');
    });

    it('filtra por cédula exacta', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion()]);

      await service.getCursosPorFuncionario({ cedula: '12345678' }, GLOBAL);

      expect(prisma.funcionarios_cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dado_de_baja: false, personas: { cedula: '12345678' } },
        }),
      );
    });

    it('devuelve calificacion como número cuando fue cargada', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion({ calificacion: '8' })]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);

      expect(result.items[0].calificacion).toBe(8);
    });

    it('devuelve el resultado y la observacion de la calificacion', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ aprobado: false, calificacion: '3', observacion_calificacion: 'No alcanzo la asistencia' }),
      ]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);

      expect(result.items[0].aprobado).toBe(false);
      expect(result.items[0].observacion).toBe('No alcanzo la asistencia');
    });

    it('devuelve aprobado sin nota cuando se califico sin cargar calificacion', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ aprobado: true, calificacion: null }),
      ]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);

      expect(result.items[0].aprobado).toBe(true);
      expect(result.items[0].calificacion).toBeNull();
    });

    it('devuelve calificacion como null cuando no fue cargada', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeInscripcion({ calificacion: null })]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);

      expect(result.items[0].calificacion).toBeNull();
    });

    it('devuelve array vacío cuando no hay inscripciones', async () => {
      const result = await service.getCursosPorFuncionario({}, GLOBAL);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('calcula el contador "Cursos Completados" — inscripciones con resultado cargado', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(3);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, aprobado: true, calificacion: '8' }),
        makeInscripcion({ id: 2n, aprobado: false, calificacion: null }),
        makeInscripcion({ id: 3n, aprobado: null, calificacion: null }),
      ]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);
      const completados = result.items.filter((i) => i.aprobado !== null).length;

      expect(completados).toBe(2);
    });

    it('calcula el contador "En Curso" — inscripciones sin resultado', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(2);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, aprobado: null }),
        makeInscripcion({ id: 2n, aprobado: true, calificacion: '9' }),
      ]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);
      const enCurso = result.items.filter((i) => i.aprobado === null).length;

      expect(enCurso).toBe(1);
    });

    it('calcula el contador "Cursos Obligatorios" — inscripciones con es_obligatorio = true', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(3);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, cursos: { id: 1n, nombre_curso: 'A', institucion: 'EMA', es_obligatorio: true } }),
        makeInscripcion({ id: 2n, cursos: { id: 2n, nombre_curso: 'B', institucion: 'EMA', es_obligatorio: false } }),
        makeInscripcion({ id: 3n, cursos: { id: 3n, nombre_curso: 'C', institucion: 'EMA', es_obligatorio: true } }),
      ]);

      const result = await service.getCursosPorFuncionario({}, GLOBAL);
      const obligatorios = result.items.filter((i) => i.curso.es_obligatorio).length;

      expect(obligatorios).toBe(2);
    });

    it('obtiene cursos finalizados pendientes de calificación (fecha_fin pasada + sin resultado)', async () => {
      const pasada = new Date('2025-01-01');
      const futura = new Date('2099-12-31');

      prisma.funcionarios_cursos.count.mockResolvedValue(3);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, fecha_fin: pasada, aprobado: null }),   // pendiente
        makeInscripcion({ id: 2n, fecha_fin: pasada, aprobado: true }),   // ya calificado
        makeInscripcion({ id: 3n, fecha_fin: futura, aprobado: null }),   // aún no finalizado
      ]);

      const ahora = new Date();
      const result = await service.getCursosPorFuncionario({}, GLOBAL);
      const pendientes = result.items.filter(
        (i) => i.fecha_fin && i.fecha_fin < ahora && i.aprobado === null,
      );

      expect(pendientes).toHaveLength(1);
    });

    it('excluye de pendientes los cursos sin fecha_fin', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, fecha_fin: null, aprobado: null }),
      ]);

      const ahora = new Date();
      const result = await service.getCursosPorFuncionario({}, GLOBAL);
      const pendientes = result.items.filter(
        (i) => i.fecha_fin && i.fecha_fin < ahora && i.aprobado === null,
      );

      expect(pendientes).toHaveLength(0);
    });

    it('excluye de pendientes los desaprobados sin nota', async () => {
      const pasada = new Date('2025-01-01');
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeInscripcion({ id: 1n, fecha_fin: pasada, aprobado: false, calificacion: null }),
      ]);

      const ahora = new Date();
      const result = await service.getCursosPorFuncionario({}, GLOBAL);
      const pendientes = result.items.filter(
        (i) => i.fecha_fin && i.fecha_fin < ahora && i.aprobado === null,
      );

      expect(pendientes).toHaveLength(0);
    });
  });

  // ─── marcarCompletacion ───────────────────────────────────────────────────

  describe('marcarCompletacion', () => {
    const completacion = {
      id: 5n,
      funcionario_curso_id: 1n,
      modulo_id: 3n,
      completado: true,
      fecha_finalizacion: new Date('2026-05-08'),
      aprobado: true,
      calificacion: '8',
      observacion_calificacion: 'Buen desempeño',
      numero_orden: 'ORD-1',
      boletin: 'RES-1',
    };

    beforeEach(() => {
      prisma.modulos_curso.findFirst.mockResolvedValue({ id: 3n, curso_id: 1n });
      prisma.funcionarios_cursos.upsert.mockResolvedValue({ id: 1n });
      prisma.funcionarios_cursos.findFirst.mockResolvedValue({ id: 1n, dado_de_baja: false });
      prisma.funcionarios_modulos_curso.upsert.mockResolvedValue(completacion);
    });

    it('recalificar sin nota ni observación conserva las anteriores y la orden', async () => {
      const result = await service.marcarCompletacion(1, 3, { persona_id: 10, aprobado: false });

      const { update } = prisma.funcionarios_modulos_curso.upsert.mock.calls[0][0];
      expect(update).toEqual({ aprobado: false });
      expect(result.calificacion).toBe(8);
      expect(result.observacion).toBe('Buen desempeño');
    });

    it('borra la nota y la observación cuando vienen en null', async () => {
      await service.marcarCompletacion(1, 3, { persona_id: 10, calificacion: null, observacion: null });

      const { update } = prisma.funcionarios_modulos_curso.upsert.mock.calls[0][0];
      expect(update).toEqual({ calificacion: null, observacion_calificacion: null });
    });

    it('completado en null no se guarda como null', async () => {
      await service.marcarCompletacion(1, 3, { persona_id: 10, completado: null as any });

      const { create, update } = prisma.funcionarios_modulos_curso.upsert.mock.calls[0][0];
      expect(update).toEqual({});
      expect(create.completado).toBe(false);
    });

    it('al crear la completación usa los valores por defecto', async () => {
      await service.marcarCompletacion(1, 3, { persona_id: 10, calificacion: 7 });

      const { create } = prisma.funcionarios_modulos_curso.upsert.mock.calls[0][0];
      expect(create).toEqual({
        funcionario_curso_id: 1n,
        modulo_id: 3n,
        completado: false,
        fecha_finalizacion: null,
        aprobado: null,
        calificacion: '7',
        observacion_calificacion: null,
        numero_orden: null,
        boletin: null,
      });
    });

    it('lanza NotFoundException si el módulo no es del curso', async () => {
      prisma.modulos_curso.findFirst.mockResolvedValue(null);

      await expect(service.marcarCompletacion(1, 99, { persona_id: 10 })).rejects.toThrow(NotFoundException);
      expect(prisma.funcionarios_modulos_curso.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── actualizarDesignacion ────────────────────────────────────────────────

  describe('actualizarDesignacion', () => {
    const designacionExistente = {
      id: 1n,
      persona_id: 10n,
      curso_id: 1n,
      aprobado: null,
      calificacion: null,
      observacion_calificacion: null,
    };

    it('registra el resultado con nota y observación', async () => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(designacionExistente);
      prisma.funcionarios_cursos.update.mockResolvedValue({
        ...designacionExistente,
        aprobado: true,
        calificacion: '8',
        observacion_calificacion: 'Buen desempeño',
      });

      const result = await service.actualizarDesignacion(1, 1, {
        aprobado: true,
        calificacion: 8,
        observacion: 'Buen desempeño',
      });

      expect(result.aprobado).toBe(true);
      expect(result.calificacion).toBe(8);
      expect(result.observacion).toBe('Buen desempeño');
      expect(result.id).toBe('1');
    });

    it('recalificar sin nota ni observación conserva las anteriores', async () => {
      const yaCalificada = { ...designacionExistente, aprobado: true, calificacion: '8', observacion_calificacion: 'Buen desempeño' };
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(yaCalificada);
      prisma.funcionarios_cursos.update.mockResolvedValue({ ...yaCalificada, aprobado: false });

      const result = await service.actualizarDesignacion(1, 1, { aprobado: false });

      expect(prisma.funcionarios_cursos.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { aprobado: false } }),
      );
      expect(result.calificacion).toBe(8);
      expect(result.observacion).toBe('Buen desempeño');
    });

    it('borra la nota y la observación cuando vienen en null', async () => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(designacionExistente);
      prisma.funcionarios_cursos.update.mockResolvedValue({ ...designacionExistente, aprobado: true });

      await service.actualizarDesignacion(1, 1, { aprobado: true, calificacion: null, observacion: null });

      expect(prisma.funcionarios_cursos.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { aprobado: true, calificacion: null, observacion_calificacion: null },
        }),
      );
    });

    it('registra un desaprobado con la observación que lo justifica', async () => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(designacionExistente);
      prisma.funcionarios_cursos.update.mockResolvedValue({
        ...designacionExistente,
        aprobado: false,
        observacion_calificacion: 'No alcanzó el mínimo de asistencia',
      });

      const result = await service.actualizarDesignacion(1, 1, {
        aprobado: false,
        observacion: 'No alcanzó el mínimo de asistencia',
      });

      expect(result.aprobado).toBe(false);
      expect(result.observacion).toBe('No alcanzó el mínimo de asistencia');
    });

    it('lanza NotFoundException si la designación no existe', async () => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(null);

      await expect(
        service.actualizarDesignacion(1, 999, { aprobado: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it.todo('lanza error si se intenta calificar un curso aún no finalizado (fecha_fin futura)');
  });

  // ─── editarInscripcion ────────────────────────────────────────────────────

  describe('editarInscripcion', () => {
    const inscripcion = {
      id: 1n,
      persona_id: 10n,
      curso_id: 1n,
      numero_orden: 'ORD-1',
      boletin: null,
      fecha_inicio: new Date('2026-03-01'),
      fecha_fin: new Date('2026-06-30'),
      aprobado: null,
      calificacion: null,
      observacion_calificacion: null,
      dado_de_baja: false,
    };

    beforeEach(() => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(inscripcion);
      prisma.funcionarios_cursos.update.mockImplementation(({ data }: any) => Promise.resolve({ ...inscripcion, ...data }));
    });

    const dataEnviada = () => prisma.funcionarios_cursos.update.mock.calls[0][0].data;

    it('corrige orden, resolución y fechas', async () => {
      const r = await service.editarInscripcion(1, 1, {
        numero_orden: 'ORD-2',
        boletin: 'RES-9',
        fecha_inicio: '2026-04-01',
        fecha_fin: '2026-07-31',
      });

      expect(dataEnviada()).toEqual({
        numero_orden: 'ORD-2',
        boletin: 'RES-9',
        fecha_inicio: new Date('2026-04-01'),
        fecha_fin: new Date('2026-07-31'),
      });
      expect(r.numero_orden).toBe('ORD-2');
    });

    it('un campo ausente no se toca', async () => {
      await service.editarInscripcion(1, 1, { boletin: 'RES-9' });
      expect(dataEnviada()).toEqual({ boletin: 'RES-9' });
    });

    it('no deja la inscripción sin orden ni resolución', async () => {
      await expect(service.editarInscripcion(1, 1, { numero_orden: '  ' })).rejects.toThrow(BadRequestException);
    });

    it('rechaza una fecha de fin anterior a la de inicio, también contra la guardada', async () => {
      await expect(service.editarInscripcion(1, 1, { fecha_fin: '2026-02-01' })).rejects.toThrow(BadRequestException);
    });

    it('carga el resultado con nota', async () => {
      await service.editarInscripcion(1, 1, { aprobado: true, calificacion: 9 });
      expect(dataEnviada()).toEqual({ aprobado: true, calificacion: '9' });
    });

    it('quitar el resultado borra también la nota y la observación', async () => {
      await service.editarInscripcion(1, 1, { aprobado: null, calificacion: 8 });
      expect(dataEnviada()).toEqual({ aprobado: null, calificacion: null, observacion_calificacion: null });
    });

    it('no acepta nota sin resultado', async () => {
      await expect(service.editarInscripcion(1, 1, { calificacion: 7 })).rejects.toThrow(BadRequestException);
    });

    it('no edita una inscripción dada de baja', async () => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue({ ...inscripcion, dado_de_baja: true });
      await expect(service.editarInscripcion(1, 1, { boletin: 'X' })).rejects.toThrow(ConflictException);
    });

    it('lanza NotFoundException si la designación no existe', async () => {
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(null);
      await expect(service.editarInscripcion(1, 999, { boletin: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── calificarDesignaciones ───────────────────────────────────────────────

  describe('calificarDesignaciones', () => {
    const makeDesignacion = (id: bigint, overrides: Partial<any> = {}) => ({
      id,
      persona_id: id * 10n,
      curso_id: 1n,
      aprobado: null,
      calificacion: null,
      observacion_calificacion: null,
      ...overrides,
    });

    it('guarda varios resultados en una sola transacción', async () => {
      prisma.funcionarios_cursos.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }]);
      prisma.funcionarios_cursos.update
        .mockResolvedValueOnce(makeDesignacion(1n, { aprobado: true, calificacion: '9' }))
        .mockResolvedValueOnce(makeDesignacion(2n, { aprobado: false }));

      const result = await service.calificarDesignaciones(1, {
        resultados: [
          { designacionId: 1, aprobado: true, calificacion: 9 },
          { designacionId: 2, aprobado: false },
        ],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.funcionarios_cursos.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { aprobado: true, calificacion: '9' },
      });
      expect(prisma.funcionarios_cursos.update).toHaveBeenCalledWith({
        where: { id: 2n },
        data: { aprobado: false },
      });
      expect(result).toEqual([
        { id: '1', curso_id: '1', persona_id: '10', aprobado: true, calificacion: 9, observacion: null },
        { id: '2', curso_id: '1', persona_id: '20', aprobado: false, calificacion: null, observacion: null },
      ]);
    });

    it('solo busca designaciones del curso indicado', async () => {
      prisma.funcionarios_cursos.findMany.mockResolvedValue([{ id: 1n }]);
      prisma.funcionarios_cursos.update.mockResolvedValue(makeDesignacion(1n, { aprobado: true }));

      await service.calificarDesignaciones(7, { resultados: [{ designacionId: 1, aprobado: true }] });

      expect(prisma.funcionarios_cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [1n] }, curso_id: 7n } }),
      );
    });

    it('no guarda ninguna si alguna designación no pertenece al curso', async () => {
      prisma.funcionarios_cursos.findMany.mockResolvedValue([{ id: 1n }]);

      await expect(
        service.calificarDesignaciones(1, {
          resultados: [
            { designacionId: 1, aprobado: true },
            { designacionId: 99, aprobado: true },
          ],
        }),
      ).rejects.toThrow(new NotFoundException('No existen designaciones con id 99 para el curso 1'));
      expect(prisma.funcionarios_cursos.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza designaciones repetidas sin tocar la base', async () => {
      await expect(
        service.calificarDesignaciones(1, {
          resultados: [
            { designacionId: 1, aprobado: true },
            { designacionId: 1, aprobado: false },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.funcionarios_cursos.findMany).not.toHaveBeenCalled();
      expect(prisma.funcionarios_cursos.update).not.toHaveBeenCalled();
    });
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

      it('rechaza un nombre_curso de solo espacios', async () => {
        const dto = plainToInstance(CursoDto, { nombre_curso: '   ', institucion: 'EMA' });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'nombre_curso')).toBe(true);
      });
    });

    describe('UpdateCursoDto', () => {
      it.each([['vacío', ''], ['de solo espacios', '   ']])(
        'rechaza nombre_curso %s',
        async (_caso, nombre_curso) => {
          const errors = await validate(plainToInstance(UpdateCursoDto, { nombre_curso }));
          expect(errors.map((e) => e.property)).toEqual(['nombre_curso']);
        },
      );

      it('acepta no mandar el nombre', async () => {
        const errors = await validate(plainToInstance(UpdateCursoDto, { es_obligatorio: true }));
        expect(errors).toHaveLength(0);
      });

      it('recorta los espacios del nombre', async () => {
        const dto = plainToInstance(UpdateCursoDto, { nombre_curso: '  Curso X  ' });
        expect(await validate(dto)).toHaveLength(0);
        expect(dto.nombre_curso).toBe('Curso X');
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

    describe('CalificarDesignacionesDto', () => {
      it('rechaza la lista vacía', async () => {
        const dto = plainToInstance(CalificarDesignacionesDto, { resultados: [] });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'resultados')).toBe(true);
      });

      it('rechaza todo el lote si una nota está fuera de rango', async () => {
        const dto = plainToInstance(CalificarDesignacionesDto, {
          resultados: [
            { designacionId: 1, aprobado: true, calificacion: 8 },
            { designacionId: 2, aprobado: true, calificacion: 11 },
          ],
        });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'resultados')).toBe(true);
      });

      it('rechaza una fila sin aprobado/desaprobado', async () => {
        const dto = plainToInstance(CalificarDesignacionesDto, {
          resultados: [{ designacionId: 1, calificacion: 8 }],
        });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'resultados')).toBe(true);
      });

      it('es válido con resultados completos', async () => {
        const dto = plainToInstance(CalificarDesignacionesDto, {
          resultados: [
            { designacionId: 1, aprobado: true, calificacion: 8 },
            { designacionId: 2, aprobado: false },
          ],
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });
    });

    describe('CreateDesignacionDto — validador "al menos uno: N° Orden o Resolución"', () => {
      const base = {
        persona_ids: [1],
        fecha_inicio: '2026-01-01',
        fecha_fin: '2026-06-30',
      };

      it('es válido con número de orden (sin resolución)', async () => {
        const dto = plainToInstance(CreateDesignacionDto, { ...base, numero_orden: 'ORD-001' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('es válido con resolución (sin número de orden)', async () => {
        const dto = plainToInstance(CreateDesignacionDto, { ...base, boletin: 'RES-2026-04' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('lanza error si N° Orden y Resolución vienen ambos ausentes', async () => {
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
        const dto = plainToInstance(UpdateDesignacionDto, { aprobado: true, calificacion: 1 });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('acepta calificación máxima válida (10)', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { aprobado: true, calificacion: 10 });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('acepta el resultado sin calificación', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { aprobado: false });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('rechaza el payload sin resultado', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { calificacion: 8 });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'aprobado')).toBe(true);
      });

      it('rechaza un resultado que no sea booleano', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { aprobado: 'si' });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'aprobado')).toBe(true);
      });

      it('rechaza calificación 0 (fuera de rango mínimo)', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { aprobado: true, calificacion: 0 });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'calificacion')).toBe(true);
      });

      it('rechaza calificación 11 (fuera de rango máximo)', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { aprobado: true, calificacion: 11 });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'calificacion')).toBe(true);
      });

      it('rechaza calificación negativa', async () => {
        const dto = plainToInstance(UpdateDesignacionDto, { aprobado: true, calificacion: -5 });
        const errors = await validate(dto);
        expect(errors.some((e) => e.property === 'calificacion')).toBe(true);
      });
    });
  });
});

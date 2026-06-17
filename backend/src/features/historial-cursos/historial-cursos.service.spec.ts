import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { HistorialCursosService } from './historial-cursos.service';
import { PrismaService } from '../../lib/prisma.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePersona = (overrides: Partial<any> = {}) => ({
  id: 10n,
  primer_nombre: 'Juan',
  primer_apellido: 'Pérez',
  ...overrides,
});

const makeCurso = (overrides: Partial<any> = {}) => ({
  id: 1n,
  nombre_curso: 'Primeros Auxilios',
  institucion: 'Cruz Roja',
  es_obligatorio: true,
  ...overrides,
});

const makeRegistro = (overrides: Partial<any> = {}) => ({
  id: 1n,
  persona_id: 10n,
  curso_id: 1n,
  numero_orden: null,
  boletin: null,
  fecha_inicio: new Date('2026-01-01'),
  fecha_fin: new Date('2026-06-30'),
  calificacion: null,
  personas: makePersona(),
  cursos: makeCurso(),
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  personas: {
    findUnique: jest.fn(),
  },
  cursos: {
    create: jest.fn(),
  },
  funcionarios_cursos: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('HistorialCursosService', () => {
  let service: HistorialCursosService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();

    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistorialCursosService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<HistorialCursosService>(HistorialCursosService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('lista inscripciones paginadas con datos de funcionario y curso', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([makeRegistro()]);

      const result = await service.findAll({ page: 1, pageSize: 10 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].nombre).toBe('Primeros Auxilios');
    });

    it('mapea correctamente el nombre del funcionario', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeRegistro({
          personas: makePersona({ primer_nombre: 'Ana', primer_apellido: 'García' }),
        }),
      ]);

      const result = await service.findAll({});

      expect(result.items[0].persona.nombre).toBe('Ana García');
    });

    it('mapea tipo como "obligatorio" cuando es_obligatorio = true', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeRegistro({ cursos: makeCurso({ es_obligatorio: true }) }),
      ]);

      const result = await service.findAll({});

      expect(result.items[0].tipo).toBe('obligatorio');
    });

    it('mapea tipo como "optativo" cuando es_obligatorio = false', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(1);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        makeRegistro({ cursos: makeCurso({ es_obligatorio: false }) }),
      ]);

      const result = await service.findAll({});

      expect(result.items[0].tipo).toBe('optativo');
    });

    it('usa paginación por defecto (page=1, pageSize=10)', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(0);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([]);

      const result = await service.findAll({});

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(prisma.funcionarios_cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('limita pageSize a 100', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(0);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([]);

      await service.findAll({ pageSize: 999 });

      expect(prisma.funcionarios_cursos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('devuelve array vacío cuando no hay inscripciones', async () => {
      prisma.funcionarios_cursos.count.mockResolvedValue(0);
      prisma.funcionarios_cursos.findMany.mockResolvedValue([]);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crea un curso y lo asigna a la persona en una transacción', async () => {
      prisma.personas.findUnique.mockResolvedValue(makePersona());
      prisma.cursos.create.mockResolvedValue(makeCurso());
      prisma.funcionarios_cursos.create.mockResolvedValue(
        makeRegistro({
          personas: makePersona({ primer_nombre: 'Juan', primer_apellido: 'Pérez' }),
          cursos: makeCurso({ nombre_curso: 'Primeros Auxilios', es_obligatorio: true }),
        }),
      );

      const result = await service.create({
        personaId: 10,
        nombre: 'Primeros Auxilios',
        institucion: 'Cruz Roja',
        tipo: 'obligatorio',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-06-30',
      });

      expect(result.nombre).toBe('Primeros Auxilios');
      expect(result.tipo).toBe('obligatorio');
      expect(result.persona.nombre).toBe('Juan Pérez');
    });

    it('mapea tipo "optativo" (es_obligatorio = false) correctamente', async () => {
      prisma.personas.findUnique.mockResolvedValue(makePersona());
      prisma.cursos.create.mockResolvedValue(makeCurso({ es_obligatorio: false }));
      prisma.funcionarios_cursos.create.mockResolvedValue(
        makeRegistro({ cursos: makeCurso({ es_obligatorio: false }) }),
      );

      await service.create({
        personaId: 10,
        nombre: 'Curso Optativo',
        institucion: 'EMA',
        tipo: 'optativo',
      });

      expect(prisma.cursos.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ es_obligatorio: false }),
        }),
      );
    });

    it('lanza NotFoundException si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          personaId: 999,
          nombre: 'Curso X',
          institucion: 'EMA',
          tipo: 'obligatorio',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea la designación con fechas correctas cuando se proveen', async () => {
      prisma.personas.findUnique.mockResolvedValue(makePersona());
      prisma.cursos.create.mockResolvedValue(makeCurso());
      prisma.funcionarios_cursos.create.mockResolvedValue(makeRegistro());

      await service.create({
        personaId: 10,
        nombre: 'Curso X',
        institucion: 'EMA',
        tipo: 'obligatorio',
        fechaInicio: '2026-03-01',
        fechaFin: '2026-09-30',
      });

      expect(prisma.funcionarios_cursos.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fecha_inicio: new Date('2026-03-01'),
            fecha_fin: new Date('2026-09-30'),
          }),
        }),
      );
    });

    it('crea la designación con fechas null cuando no se proveen', async () => {
      prisma.personas.findUnique.mockResolvedValue(makePersona());
      prisma.cursos.create.mockResolvedValue(makeCurso());
      prisma.funcionarios_cursos.create.mockResolvedValue(makeRegistro());

      await service.create({
        personaId: 10,
        nombre: 'Curso X',
        institucion: 'EMA',
        tipo: 'obligatorio',
      });

      expect(prisma.funcionarios_cursos.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fecha_inicio: null,
            fecha_fin: null,
          }),
        }),
      );
    });
  });
});

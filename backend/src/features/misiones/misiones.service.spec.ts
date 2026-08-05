import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MisionesService } from './misiones.service';
import { PrismaService } from '../../lib/prisma.service';
import { CreateMisionDto } from './dto/create-mision.dto';
import { UpdateMisionDto } from './dto/update-mision.dto';
import { CreateConvocatoriaDto } from './dto/create-convocatoria.dto';
import { AddFuncionariosConvocatoriaDto, FuncionarioConvocatoriaItemDto } from './dto/add-funcionarios-convocatoria.dto';
import { UpdateFuncionarioConvocatoriaDto } from './dto/update-funcionario-convocatoria.dto';

// ─── Fechas de referencia ─────────────────────────────────────────────────────
const FECHA_PASADA = new Date('2020-01-01');
const FECHA_FUTURA = new Date('2099-01-01');

// ─── Factories ────────────────────────────────────────────────────────────────

const makeMision = (overrides: Partial<any> = {}) => ({
  id: 1n,
  nombre_mision: 'Congo (MONUSCO)',
  pais: 'República Democrática del Congo',
  _count: { convocatorias: 2 },
  ...overrides,
});

const makeConvocatoria = (overrides: Partial<any> = {}) => ({
  id: 10n,
  mision_id: 1n,
  numero_orden: 'ORD-2026-001',
  boletin: null,
  fecha_salida: null,
  fecha_llegada: null,
  observaciones: null,
  _count: { funcionarios: 0 },
  ...overrides,
});

const makePersonaMin = (overrides: Partial<any> = {}) => ({
  id: 100n,
  cedula: '12345678',
  primer_nombre: 'Juan',
  primer_apellido: 'Pérez',
  ...overrides,
});

const makeAsignacion = (overrides: Partial<any> = {}) => ({
  id: 200n,
  convocatoria_id: 10n,
  persona_id: 100n,
  numero_orden: 'ORD-2026-001',
  boletin: null,
  observaciones: null,
  personas: makePersonaMin(),
  ...overrides,
});

const makeAsignacionConvocatoria = (overrides: Partial<any> = {}) => ({
  ...makeAsignacion(),
  convocatorias: {
    id: 10n,
    mision_id: 1n,
    numero_orden: 'ORD-2026-001',
    boletin: null,
    fecha_salida: new Date('2026-03-01'),
    fecha_llegada: null,
    misiones: {
      id: 1n,
      nombre_mision: 'Congo (MONUSCO)',
      pais: 'República Democrática del Congo',
    },
  },
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  misiones: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  convocatorias: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  funcionarios_convocatorias: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  personas: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('MisionesService', () => {
  let service: MisionesService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeAll(async () => {
    prisma = makePrismaMock();

    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MisionesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MisionesService>(MisionesService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });
  });

  // ─── listarMisiones ──────────────────────────────────────────────────────────

  describe('listarMisiones', () => {
    beforeEach(() => {
      prisma.misiones.count.mockResolvedValue(0);
      prisma.misiones.findMany.mockResolvedValue([]);
      prisma.convocatorias.count.mockResolvedValue(0);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([]);
    });

    it('devuelve items paginados con stats globales', async () => {
      prisma.misiones.count.mockResolvedValue(2);
      prisma.misiones.findMany.mockResolvedValue([makeMision({ id: 1n }), makeMision({ id: 2n })]);
      prisma.convocatorias.count.mockResolvedValue(3);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([
        { persona_id: 10n },
        { persona_id: 20n },
      ]);

      const result = await service.listarMisiones({ page: 1, pageSize: 10 });

      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.items).toHaveLength(2);
      expect(result.stats.total_misiones).toBe(2);
      expect(result.stats.convocatorias_activas).toBe(3);
      expect(result.stats.personal_desplegado).toBe(2);
    });

    it('usa page=1 y pageSize=10 por defecto', async () => {
      await service.listarMisiones();

      expect(prisma.misiones.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('filtra por nombre parcial insensible a mayúsculas', async () => {
      prisma.misiones.count.mockResolvedValue(1);
      prisma.misiones.findMany.mockResolvedValue([makeMision()]);

      await service.listarMisiones({ nombre: 'congo' });

      expect(prisma.misiones.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nombre_mision: { contains: 'congo', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('filtra por pais parcial insensible a mayúsculas', async () => {
      prisma.misiones.count.mockResolvedValue(1);
      prisma.misiones.findMany.mockResolvedValue([makeMision()]);

      await service.listarMisiones({ pais: 'república' });

      expect(prisma.misiones.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            pais: { contains: 'república', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('capea pageSize a 200', async () => {
      await service.listarMisiones({ pageSize: 999 });

      expect(prisma.misiones.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('mapea id a string en cada item', async () => {
      prisma.misiones.count.mockResolvedValue(1);
      prisma.misiones.findMany.mockResolvedValue([makeMision({ id: 5n })]);

      const result = await service.listarMisiones();

      expect(result.items[0].id).toBe('5');
    });
  });

  // ─── obtenerMision ───────────────────────────────────────────────────────────

  describe('obtenerMision', () => {
    it('devuelve misión con id como string y total_convocatorias', async () => {
      prisma.misiones.findUnique.mockResolvedValue(makeMision({ id: 7n, _count: { convocatorias: 3 } }));

      const result = await service.obtenerMision(7);

      expect(result.id).toBe('7');
      expect(result.nombre_mision).toBe('Congo (MONUSCO)');
      expect(result.total_convocatorias).toBe(3);
    });

    it('lanza NotFoundException si la misión no existe', async () => {
      prisma.misiones.findUnique.mockResolvedValue(null);

      await expect(service.obtenerMision(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── crearMision ─────────────────────────────────────────────────────────────

  describe('crearMision', () => {
    it('crea misión y devuelve id como string', async () => {
      prisma.misiones.findFirst.mockResolvedValue(null);
      prisma.misiones.create.mockResolvedValue(makeMision({ id: 3n }));

      const result = await service.crearMision({
        nombre_mision: 'Congo (MONUSCO)',
        pais: 'República Democrática del Congo',
      });

      expect(result.id).toBe('3');
      expect(result.nombre_mision).toBe('Congo (MONUSCO)');
      expect(result.pais).toBe('República Democrática del Congo');
    });

    it('lanza ConflictException si ya existe una misión con el mismo nombre', async () => {
      prisma.misiones.findFirst.mockResolvedValue(makeMision());

      await expect(
        service.crearMision({ nombre_mision: 'Congo (MONUSCO)', pais: 'RDC' }),
      ).rejects.toThrow(ConflictException);
    });

    it('llama a create con nombre_mision y pais exactos', async () => {
      prisma.misiones.findFirst.mockResolvedValue(null);
      prisma.misiones.create.mockResolvedValue(makeMision());

      await service.crearMision({ nombre_mision: 'Líbano (FINUL)', pais: 'Líbano' });

      expect(prisma.misiones.create).toHaveBeenCalledWith({
        data: { nombre_mision: 'Líbano (FINUL)', pais: 'Líbano' },
      });
    });
  });

  // ─── editarMision ─────────────────────────────────────────────────────────────

  describe('editarMision', () => {
    it('actualiza nombre y pais y devuelve datos actualizados', async () => {
      const misionOriginal = makeMision();
      const misionActualizada = makeMision({ nombre_mision: 'Nuevo Nombre', pais: 'Nuevo País' });
      prisma.misiones.findUnique.mockResolvedValue(misionOriginal);
      prisma.misiones.findFirst.mockResolvedValue(null);
      prisma.misiones.update.mockResolvedValue(misionActualizada);

      const result = await service.editarMision(1, { nombre_mision: 'Nuevo Nombre', pais: 'Nuevo País' });

      expect(result.nombre_mision).toBe('Nuevo Nombre');
      expect(result.pais).toBe('Nuevo País');
    });

    it('lanza NotFoundException si la misión no existe', async () => {
      prisma.misiones.findUnique.mockResolvedValue(null);

      await expect(service.editarMision(999, { pais: 'Uruguay' })).rejects.toThrow(NotFoundException);
    });

    it('lanza ConflictException si el nuevo nombre ya existe en otra misión', async () => {
      prisma.misiones.findUnique.mockResolvedValue(makeMision({ nombre_mision: 'Nombre Actual' }));
      prisma.misiones.findFirst.mockResolvedValue(makeMision({ id: 2n }));

      await expect(
        service.editarMision(1, { nombre_mision: 'Nombre Duplicado' }),
      ).rejects.toThrow(ConflictException);
    });

    it('no verifica duplicado si el nombre no cambia', async () => {
      const mision = makeMision({ nombre_mision: 'Congo (MONUSCO)' });
      prisma.misiones.findUnique.mockResolvedValue(mision);
      prisma.misiones.update.mockResolvedValue(mision);

      await service.editarMision(1, { nombre_mision: 'Congo (MONUSCO)' });

      expect(prisma.misiones.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── eliminarMision ───────────────────────────────────────────────────────────

  describe('eliminarMision', () => {
    it('elimina la misión y devuelve { id, eliminado: true }', async () => {
      prisma.misiones.findUnique.mockResolvedValue(makeMision({ id: 4n }));
      prisma.misiones.delete.mockResolvedValue({});

      const result = await service.eliminarMision(4);

      expect(result).toEqual({ id: '4', eliminado: true });
      expect(prisma.misiones.delete).toHaveBeenCalledWith({ where: { id: 4n } });
    });

    it('lanza NotFoundException si la misión no existe', async () => {
      prisma.misiones.findUnique.mockResolvedValue(null);

      await expect(service.eliminarMision(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listarConvocatorias ──────────────────────────────────────────────────────

  describe('listarConvocatorias', () => {
    beforeEach(() => {
      prisma.misiones.findUnique.mockResolvedValue(makeMision());
      prisma.convocatorias.count.mockResolvedValue(0);
      prisma.convocatorias.findMany.mockResolvedValue([]);
    });

    it('devuelve convocatorias paginadas con total y page', async () => {
      prisma.convocatorias.count.mockResolvedValue(3);
      prisma.convocatorias.findMany.mockResolvedValue([
        makeConvocatoria({ id: 1n }),
        makeConvocatoria({ id: 2n }),
        makeConvocatoria({ id: 3n }),
      ]);

      const result = await service.listarConvocatorias(1, { page: 1, pageSize: 10 });

      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.items).toHaveLength(3);
    });

    it('lanza NotFoundException si la misión no existe', async () => {
      prisma.misiones.findUnique.mockResolvedValue(null);

      await expect(service.listarConvocatorias(999, {})).rejects.toThrow(NotFoundException);
    });

    it('filtra por query (busca en numero_orden y boletin)', async () => {
      prisma.convocatorias.count.mockResolvedValue(1);
      prisma.convocatorias.findMany.mockResolvedValue([makeConvocatoria()]);

      await service.listarConvocatorias(1, { query: 'ORD-2026' });

      expect(prisma.convocatorias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { numero_orden: { contains: 'ORD-2026', mode: 'insensitive' } },
              { boletin: { contains: 'ORD-2026', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('filtra por finalizada=true', async () => {
      prisma.convocatorias.findMany.mockResolvedValue([]);

      await service.listarConvocatorias(1, { finalizada: true });

      expect(prisma.convocatorias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fecha_llegada: expect.objectContaining({ not: null, lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it('filtra por finalizada=false', async () => {
      prisma.convocatorias.findMany.mockResolvedValue([]);

      await service.listarConvocatorias(1, { finalizada: false });

      expect(prisma.convocatorias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { fecha_llegada: null },
            ]),
          }),
        }),
      );
    });

    it('mapea id a string y calcula finalizada=false para fecha_llegada=null', async () => {
      prisma.convocatorias.count.mockResolvedValue(1);
      prisma.convocatorias.findMany.mockResolvedValue([makeConvocatoria({ id: 5n, fecha_llegada: null })]);

      const result = await service.listarConvocatorias(1, {});

      expect((result.items[0] as any).id).toBe('5');
      expect((result.items[0] as any).finalizada).toBe(false);
    });
  });

  // ─── obtenerConvocatoria ──────────────────────────────────────────────────────

  describe('obtenerConvocatoria', () => {
    it('devuelve convocatoria con finalizada=true si fecha_llegada ya pasó', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(
        makeConvocatoria({ fecha_llegada: FECHA_PASADA }),
      );

      const result = await service.obtenerConvocatoria(1, 10) as any;

      expect(result.finalizada).toBe(true);
      expect(result.fecha_llegada).toBe('2020-01-01');
    });

    it('devuelve finalizada=false si fecha_llegada es futura', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(
        makeConvocatoria({ fecha_llegada: FECHA_FUTURA }),
      );

      const result = await service.obtenerConvocatoria(1, 10) as any;

      expect(result.finalizada).toBe(false);
    });

    it('lanza NotFoundException si la convocatoria no existe', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(null);

      await expect(service.obtenerConvocatoria(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── crearConvocatoria ────────────────────────────────────────────────────────

  describe('crearConvocatoria', () => {
    const convCreada = makeConvocatoria({ id: 11n, mision_id: 1n });

    beforeEach(() => {
      prisma.misiones.findUnique.mockResolvedValue(makeMision());
      prisma.convocatorias.create.mockResolvedValue(convCreada);
      prisma.funcionarios_convocatorias.createMany.mockResolvedValue({ count: 0 });
    });

    it('crea convocatoria con numero_orden y devuelve id como string', async () => {
      const result = await service.crearConvocatoria(1, { numero_orden: 'ORD-001' }) as any;

      expect(result.id).toBe('11');
      expect(result.mision_id).toBe('1');
      expect(prisma.convocatorias.create).toHaveBeenCalled();
    });

    it('crea convocatoria con solo boletin', async () => {
      await service.crearConvocatoria(1, { boletin: 'BOL-2026-04' });

      expect(prisma.convocatorias.create).toHaveBeenCalled();
    });

    it('lanza NotFoundException si la misión no existe', async () => {
      prisma.misiones.findUnique.mockResolvedValue(null);

      await expect(service.crearConvocatoria(999, { numero_orden: 'ORD-001' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si no se proveen numero_orden ni boletin', async () => {
      await expect(service.crearConvocatoria(1, {})).rejects.toThrow(BadRequestException);
    });

    it('llama a createMany con los persona_ids cuando se proveen', async () => {
      await service.crearConvocatoria(1, {
        numero_orden: 'ORD-001',
        persona_ids: [10, 20],
      });

      expect(prisma.funcionarios_convocatorias.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ persona_id: 10n }),
            expect.objectContaining({ persona_id: 20n }),
          ]),
        }),
      );
    });

    it('no llama a createMany si persona_ids está vacío', async () => {
      await service.crearConvocatoria(1, { numero_orden: 'ORD-001' });

      expect(prisma.funcionarios_convocatorias.createMany).not.toHaveBeenCalled();
    });

    it('calcula finalizada=true cuando fecha_llegada ya pasó', async () => {
      prisma.convocatorias.create.mockResolvedValue(
        makeConvocatoria({ fecha_llegada: FECHA_PASADA }),
      );

      const result = await service.crearConvocatoria(1, { numero_orden: 'ORD-001' }) as any;

      expect(result.finalizada).toBe(true);
    });
  });

  // ─── editarConvocatoria ───────────────────────────────────────────────────────

  describe('editarConvocatoria', () => {
    const convExistente = makeConvocatoria({ numero_orden: 'ORD-OLD', boletin: null });

    it('actualiza campos y devuelve datos actualizados', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(convExistente);
      prisma.convocatorias.update.mockResolvedValue(
        makeConvocatoria({ numero_orden: 'ORD-NEW' }),
      );

      const result = await service.editarConvocatoria(1, 10, { numero_orden: 'ORD-NEW' }) as any;

      expect(result.numero_orden).toBe('ORD-NEW');
    });

    it('lanza NotFoundException si la convocatoria no existe', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(null);

      await expect(service.editarConvocatoria(1, 999, { observaciones: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza BadRequestException si la edición dejaría sin numero_orden ni boletin', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(
        makeConvocatoria({ numero_orden: 'ORD-OLD', boletin: null }),
      );

      // Setear numero_orden a null dejaría la convocatoria sin ninguno de los dos
      await expect(
        service.editarConvocatoria(1, 10, { numero_orden: null as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── eliminarConvocatoria ─────────────────────────────────────────────────────

  describe('eliminarConvocatoria', () => {
    it('elimina y devuelve { id, eliminado: true }', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(makeConvocatoria({ id: 10n }));
      prisma.convocatorias.delete.mockResolvedValue({});

      const result = await service.eliminarConvocatoria(1, 10);

      expect(result).toEqual({ id: '10', eliminado: true });
      expect(prisma.convocatorias.delete).toHaveBeenCalledWith({ where: { id: 10n } });
    });

    it('lanza NotFoundException si la convocatoria no existe', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(null);

      await expect(service.eliminarConvocatoria(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listarFuncionariosConvocatoria ───────────────────────────────────────────

  describe('listarFuncionariosConvocatoria', () => {
    beforeEach(() => {
      prisma.convocatorias.findFirst.mockResolvedValue(makeConvocatoria());
      prisma.funcionarios_convocatorias.count.mockResolvedValue(0);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([]);
    });

    it('devuelve funcionarios paginados con datos de persona', async () => {
      prisma.funcionarios_convocatorias.count.mockResolvedValue(1);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([makeAsignacion()]);

      const result = await service.listarFuncionariosConvocatoria(1, 10, {});

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].cedula).toBe('12345678');
      expect(result.items[0].persona_id).toBe('100');
    });

    it('lanza NotFoundException si la convocatoria no existe', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(null);

      await expect(service.listarFuncionariosConvocatoria(1, 999, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('filtra por query (cedula, nombre, apellido)', async () => {
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([]);

      await service.listarFuncionariosConvocatoria(1, 10, { query: 'pérez' });

      expect(prisma.funcionarios_convocatorias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            personas: {
              OR: expect.arrayContaining([
                { cedula: { contains: 'pérez', mode: 'insensitive' } },
                { primer_nombre: { contains: 'pérez', mode: 'insensitive' } },
                { primer_apellido: { contains: 'pérez', mode: 'insensitive' } },
              ]),
            },
          }),
        }),
      );
    });

    it('mapea id de asignación y persona_id a string', async () => {
      prisma.funcionarios_convocatorias.count.mockResolvedValue(1);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([
        makeAsignacion({ id: 55n, persona_id: 77n }),
      ]);

      const result = await service.listarFuncionariosConvocatoria(1, 10, {});

      expect(result.items[0].id).toBe('55');
      expect(result.items[0].persona_id).toBe('77');
    });
  });

  // ─── agregarFuncionarios ──────────────────────────────────────────────────────

  describe('agregarFuncionarios', () => {
    const dto = {
      funcionarios: [
        { persona_id: 10, numero_orden: 'ORD-001' },
        { persona_id: 20, numero_orden: 'ORD-002' },
      ],
    };

    beforeEach(() => {
      prisma.convocatorias.findFirst.mockResolvedValue(makeConvocatoria());
      prisma.personas.findMany.mockResolvedValue([{ id: 10n }, { id: 20n }]);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([]);
      prisma.funcionarios_convocatorias.createMany.mockResolvedValue({ count: 2 });
    });

    it('agrega funcionarios y devuelve la cantidad agregada', async () => {
      const result = await service.agregarFuncionarios(1, 10, dto);

      expect(result.agregados).toBe(2);
      expect(result.convocatoria_id).toBe('10');
      expect(prisma.funcionarios_convocatorias.createMany).toHaveBeenCalled();
    });

    it('lanza NotFoundException si la convocatoria no existe', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(null);

      await expect(service.agregarFuncionarios(1, 999, dto)).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si alguna persona no existe', async () => {
      prisma.personas.findMany.mockResolvedValue([{ id: 10n }]); // solo una de dos

      await expect(service.agregarFuncionarios(1, 10, dto)).rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException si algún funcionario ya está asignado', async () => {
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([{ persona_id: 10n }]);

      await expect(service.agregarFuncionarios(1, 10, dto)).rejects.toThrow(ConflictException);
    });

    it('llama a createMany con BigInt de persona_id', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(makeConvocatoria());
      prisma.personas.findMany.mockResolvedValue([{ id: 42n }]);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([]);
      prisma.funcionarios_convocatorias.createMany.mockResolvedValue({ count: 1 });

      await service.agregarFuncionarios(1, 10, {
        funcionarios: [{ persona_id: 42, numero_orden: 'ORD-001' }],
      });

      expect(prisma.funcionarios_convocatorias.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ persona_id: 42n }),
        ]),
      });
    });
  });

  // ─── editarFuncionarioConvocatoria ────────────────────────────────────────────

  describe('editarFuncionarioConvocatoria', () => {
    const asignacionExistente = makeAsignacion({ numero_orden: 'ORD-OLD', boletin: null });

    it('actualiza campos y devuelve datos', async () => {
      prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(asignacionExistente);
      prisma.funcionarios_convocatorias.update.mockResolvedValue(
        makeAsignacion({ numero_orden: 'ORD-NEW', id: 200n, persona_id: 100n }),
      );

      const result = await service.editarFuncionarioConvocatoria(1, 10, 100, {
        numero_orden: 'ORD-NEW',
      });

      expect(result.numero_orden).toBe('ORD-NEW');
      expect(result.id).toBe('200');
      expect(result.persona_id).toBe('100');
    });

    it('lanza NotFoundException si la asignación no existe', async () => {
      prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(null);

      await expect(
        service.editarFuncionarioConvocatoria(1, 10, 999, { observaciones: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si quedaría sin numero_orden ni boletin', async () => {
      prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(
        makeAsignacion({ numero_orden: 'ORD-OLD', boletin: null }),
      );

      await expect(
        service.editarFuncionarioConvocatoria(1, 10, 100, { numero_orden: null as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── quitarFuncionario ────────────────────────────────────────────────────────

  describe('quitarFuncionario', () => {
    it('elimina la asignación y devuelve { eliminado: true }', async () => {
      prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(makeAsignacion({ id: 200n }));
      prisma.funcionarios_convocatorias.delete.mockResolvedValue({});

      const result = await service.quitarFuncionario(1, 10, 100);

      expect(result).toEqual({ eliminado: true });
      expect(prisma.funcionarios_convocatorias.delete).toHaveBeenCalledWith({ where: { id: 200n } });
    });

    it('lanza NotFoundException si la asignación no existe', async () => {
      prisma.funcionarios_convocatorias.findFirst.mockResolvedValue(null);

      await expect(service.quitarFuncionario(1, 10, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── quitarTodosFuncionarios ──────────────────────────────────────────────────

  describe('quitarTodosFuncionarios', () => {
    it('elimina todos y devuelve { eliminados: count }', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(makeConvocatoria());
      prisma.funcionarios_convocatorias.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.quitarTodosFuncionarios(1, 10);

      expect(result).toEqual({ eliminados: 5 });
      expect(prisma.funcionarios_convocatorias.deleteMany).toHaveBeenCalledWith({
        where: { convocatoria_id: 10n },
      });
    });

    it('lanza NotFoundException si la convocatoria no existe', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue(null);

      await expect(service.quitarTodosFuncionarios(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listarPersonalEnMision ───────────────────────────────────────────────────

  describe('listarPersonalEnMision', () => {
    beforeEach(() => {
      prisma.funcionarios_convocatorias.count.mockResolvedValue(0);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([]);
    });

    it('devuelve listado plano con datos anidados de persona, mision y convocatoria', async () => {
      prisma.funcionarios_convocatorias.count.mockResolvedValue(1);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([makeAsignacionConvocatoria()]);

      const result = await service.listarPersonalEnMision({});

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);

      const item = result.items[0] as any;
      expect(item.id).toBe('200');
      expect(item.persona.cedula).toBe('12345678');
      expect(item.mision.nombre_mision).toBe('Congo (MONUSCO)');
      expect(item.convocatoria_id).toBe('10');
    });

    it('calcula finalizada=true para convocatoria con fecha_llegada en el pasado', async () => {
      const asignacion = makeAsignacionConvocatoria({
        convocatorias: {
          ...makeConvocatoria(),
          fecha_salida: new Date('2020-01-01'),
          fecha_llegada: FECHA_PASADA,
          misiones: makeMision(),
        },
      });
      prisma.funcionarios_convocatorias.count.mockResolvedValue(1);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([asignacion]);

      const result = await service.listarPersonalEnMision({});

      expect((result.items[0] as any).finalizada).toBe(true);
    });

    it('calcula finalizada=false cuando fecha_llegada es null', async () => {
      prisma.funcionarios_convocatorias.count.mockResolvedValue(1);
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([makeAsignacionConvocatoria()]);

      const result = await service.listarPersonalEnMision({});

      expect((result.items[0] as any).finalizada).toBe(false);
    });

    it('usa page=1 y pageSize=200 por defecto', async () => {
      await service.listarPersonalEnMision();

      expect(prisma.funcionarios_convocatorias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 200 }),
      );
    });

    it('capea pageSize a 200', async () => {
      await service.listarPersonalEnMision({ pageSize: 999 });

      expect(prisma.funcionarios_convocatorias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });
  });

  // ─── DTO: CreateMisionDto ─────────────────────────────────────────────────────

  describe('CreateMisionDto', () => {
    const toDto = (plain: object) => plainToInstance(CreateMisionDto, plain);

    it('acepta nombre_mision y pais válidos', async () => {
      const errors = await validate(toDto({ nombre_mision: 'Congo', pais: 'RDC' }));
      expect(errors).toHaveLength(0);
    });

    it('rechaza nombre_mision vacío', async () => {
      const errors = await validate(toDto({ nombre_mision: '', pais: 'RDC' }));
      expect(errors.some((e) => e.property === 'nombre_mision')).toBe(true);
    });

    it('rechaza pais vacío', async () => {
      const errors = await validate(toDto({ nombre_mision: 'Congo', pais: '' }));
      expect(errors.some((e) => e.property === 'pais')).toBe(true);
    });

    it('rechaza nombre_mision ausente', async () => {
      const errors = await validate(toDto({ pais: 'RDC' }));
      expect(errors.some((e) => e.property === 'nombre_mision')).toBe(true);
    });

    it('rechaza pais ausente', async () => {
      const errors = await validate(toDto({ nombre_mision: 'Congo' }));
      expect(errors.some((e) => e.property === 'pais')).toBe(true);
    });

    it('rechaza nombre_mision que excede 200 caracteres', async () => {
      const errors = await validate(toDto({ nombre_mision: 'a'.repeat(201), pais: 'RDC' }));
      expect(errors.some((e) => e.property === 'nombre_mision')).toBe(true);
    });

    it('rechaza pais que excede 100 caracteres', async () => {
      const errors = await validate(toDto({ nombre_mision: 'Congo', pais: 'a'.repeat(101) }));
      expect(errors.some((e) => e.property === 'pais')).toBe(true);
    });
  });

  // ─── DTO: UpdateMisionDto ─────────────────────────────────────────────────────

  describe('UpdateMisionDto', () => {
    const toDto = (plain: object) => plainToInstance(UpdateMisionDto, plain);

    it('acepta objeto vacío (todos opcionales)', async () => {
      const errors = await validate(toDto({}));
      expect(errors).toHaveLength(0);
    });

    it('acepta solo nombre_mision', async () => {
      const errors = await validate(toDto({ nombre_mision: 'Nuevo' }));
      expect(errors).toHaveLength(0);
    });

    it('acepta solo pais', async () => {
      const errors = await validate(toDto({ pais: 'Uruguay' }));
      expect(errors).toHaveLength(0);
    });
  });

  // ─── DTO: CreateConvocatoriaDto ───────────────────────────────────────────────

  describe('CreateConvocatoriaDto', () => {
    const toDto = (plain: object) => plainToInstance(CreateConvocatoriaDto, plain);

    it('acepta solo numero_orden', async () => {
      const errors = await validate(toDto({ numero_orden: 'ORD-001' }));
      expect(errors).toHaveLength(0);
    });

    it('acepta solo boletin', async () => {
      const errors = await validate(toDto({ boletin: 'BOL-2026' }));
      expect(errors).toHaveLength(0);
    });

    it('acepta ambos campos', async () => {
      const errors = await validate(toDto({ numero_orden: 'ORD-001', boletin: 'BOL-2026' }));
      expect(errors).toHaveLength(0);
    });

    it('rechaza cuando ninguno está presente (ValidateIf activos en ambos)', async () => {
      const errors = await validate(toDto({}));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('acepta fecha_salida y fecha_llegada en formato ISO', async () => {
      const errors = await validate(
        toDto({ numero_orden: 'ORD-001', fecha_salida: '2026-03-01', fecha_llegada: '2026-09-30' }),
      );
      expect(errors).toHaveLength(0);
    });

    it('rechaza fecha_salida con formato inválido', async () => {
      const errors = await validate(toDto({ numero_orden: 'ORD-001', fecha_salida: 'no-es-fecha' }));
      expect(errors.some((e) => e.property === 'fecha_salida')).toBe(true);
    });
  });

  // ─── DTO: FuncionarioConvocatoriaItemDto ──────────────────────────────────────

  describe('FuncionarioConvocatoriaItemDto', () => {
    const toDto = (plain: object) => plainToInstance(FuncionarioConvocatoriaItemDto, plain);

    it('acepta persona_id con numero_orden', async () => {
      const errors = await validate(toDto({ persona_id: 42, numero_orden: 'ORD-001' }));
      expect(errors).toHaveLength(0);
    });

    it('acepta persona_id con boletin', async () => {
      const errors = await validate(toDto({ persona_id: 42, boletin: 'BOL-2026' }));
      expect(errors).toHaveLength(0);
    });

    it('rechaza cuando no hay ni numero_orden ni boletin', async () => {
      const errors = await validate(toDto({ persona_id: 42 }));
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rechaza persona_id no entero', async () => {
      const errors = await validate(toDto({ persona_id: 'abc', numero_orden: 'ORD-001' }));
      expect(errors.some((e) => e.property === 'persona_id')).toBe(true);
    });
  });

  // ─── DTO: AddFuncionariosConvocatoriaDto ──────────────────────────────────────

  describe('AddFuncionariosConvocatoriaDto', () => {
    const toDto = (plain: object) => plainToInstance(AddFuncionariosConvocatoriaDto, plain);

    it('acepta un array con un funcionario válido', async () => {
      const errors = await validate(
        toDto({ funcionarios: [{ persona_id: 1, numero_orden: 'ORD-001' }] }),
      );
      expect(errors).toHaveLength(0);
    });

    it('rechaza array vacío', async () => {
      const errors = await validate(toDto({ funcionarios: [] }));
      expect(errors.some((e) => e.property === 'funcionarios')).toBe(true);
    });

    it('rechaza cuando falta el campo funcionarios', async () => {
      const errors = await validate(toDto({}));
      expect(errors.some((e) => e.property === 'funcionarios')).toBe(true);
    });
  });

  // ─── DTO: UpdateFuncionarioConvocatoriaDto ────────────────────────────────────

  describe('UpdateFuncionarioConvocatoriaDto', () => {
    const toDto = (plain: object) => plainToInstance(UpdateFuncionarioConvocatoriaDto, plain);

    it('acepta objeto vacío (todos opcionales)', async () => {
      const errors = await validate(toDto({}));
      expect(errors).toHaveLength(0);
    });

    it('acepta solo observaciones', async () => {
      const errors = await validate(toDto({ observaciones: 'Observación actualizada' }));
      expect(errors).toHaveLength(0);
    });

    it('rechaza numero_orden que excede 50 caracteres', async () => {
      const errors = await validate(toDto({ numero_orden: 'x'.repeat(51) }));
      expect(errors.some((e) => e.property === 'numero_orden')).toBe(true);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DestinosService } from './destinos.service';
import { PrismaService } from '../../lib/prisma.service';
import { CreateDestinoDto } from './dto/create-destino.dto';
import { UpdateDestinoDto } from './dto/update-destino.dto';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeUnidad = (overrides: Partial<any> = {}) => ({
  id: 5n,
  codigo: 'CG',
  denominacion: 'Cuartel General',
  tipo: 'Unidad',
  vigente: true,
  ...overrides,
});

const makePersonaMin = (overrides: Partial<any> = {}) => ({
  id: 100n,
  cedula: '12345678',
  primer_nombre: 'José',
  primer_apellido: 'Pérez',
  ...overrides,
});

const makeAsignacion = (overrides: Partial<any> = {}) => ({
  id: 200n,
  persona_id: 100n,
  unidad_id: 5n,
  fecha_inicio: new Date('2024-04-30'),
  fecha_fin: null,
  posicion_destino: 'Sub-Jefe de Personal A-1',
  numero_orden: 'O.D. 11007',
  boletin: null,
  observaciones: null,
  personas: makePersonaMin(),
  unidades: makeUnidad(),
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  destinos: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  unidades: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  personas: {
    findUnique: jest.fn(),
  },
  relaciones_laborales: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('DestinosService', () => {
  let service: DestinosService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeAll(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DestinosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DestinosService>(DestinosService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });
  });

  // ─── crearDestino ───────────────────────────────────────────────────────────

  describe('crearDestino', () => {
    const dtoBase = {
      persona_id: 100,
      unidad_id: 5,
      fecha_inicio: '2026-09-01',
      posicion_destino: 'Jefe de Sección',
      numero_orden: 'O.D. 12455',
    };

    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue(makePersonaMin());
      prisma.unidades.findUnique.mockResolvedValue(makeUnidad());
      prisma.destinos.findFirst.mockResolvedValue(null);
      prisma.destinos.create.mockResolvedValue(
        makeAsignacion({ id: 300n, fecha_inicio: new Date('2026-09-01') }),
      );
      prisma.destinos.update.mockResolvedValue(makeAsignacion());
      prisma.relaciones_laborales.updateMany.mockResolvedValue({ count: 1 });
    });

    it('crea el destino cuando el funcionario no tiene ninguno activo', async () => {
      const result = await service.crearDestino(dtoBase);

      expect(prisma.destinos.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            persona_id: 100n,
            unidad_id: 5n,
            fecha_inicio: new Date('2026-09-01'),
            fecha_fin: null,
          }),
        }),
      );
      expect(result.id).toBe('300');
      expect(result.activo).toBe(true);
    });

    it('no cierra nada si el funcionario no tenía destino activo', async () => {
      await service.crearDestino(dtoBase);

      expect(prisma.destinos.update).not.toHaveBeenCalled();
    });

    it('cierra el destino activo anterior el día previo al nuevo inicio', async () => {
      prisma.destinos.findFirst.mockResolvedValue(
        makeAsignacion({ id: 200n, unidad_id: 9n }),
      );

      await service.crearDestino(dtoBase);

      expect(prisma.destinos.update).toHaveBeenCalledWith({
        where: { id: 200n },
        data: { fecha_fin: new Date('2026-08-31') },
      });
    });

    it('cierra el destino anterior con la fecha que manda el cliente', async () => {
      prisma.destinos.findFirst.mockResolvedValue(
        makeAsignacion({ id: 200n, unidad_id: 9n }),
      );

      await service.crearDestino({ ...dtoBase, fecha_fin_anterior: '2026-08-15' });

      expect(prisma.destinos.update).toHaveBeenCalledWith({
        where: { id: 200n },
        data: { fecha_fin: new Date('2026-08-15') },
      });
    });

    // La relación vigente se identifica por `fecha_fin: null`, que es el mismo
    // criterio que usan GET /personas y el perfil para mostrar el destino.
    it('sincroniza la unidad de la relación laboral vigente', async () => {
      await service.crearDestino(dtoBase);

      expect(prisma.relaciones_laborales.updateMany).toHaveBeenCalledWith({
        where: { persona_id: 100n, fecha_fin: null },
        data: { unidad_id: 5n },
      });
    });

    // Regresión: filtrar por `estado: 'activo'` dejaba sin sincronizar a quien
    // tiene la relación abierta con otro estado (p. ej. situación Retiro), y el
    // listado de personal seguía mostrando la unidad vieja para siempre.
    it('no filtra la relación laboral por estado', async () => {
      await service.crearDestino(dtoBase);

      const [args] = prisma.relaciones_laborales.updateMany.mock.calls[0];

      expect(args.where).not.toHaveProperty('estado');
    });

    it('registra el pase completo en una sola transacción', async () => {
      await service.crearDestino(dtoBase);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('rechaza si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.crearDestino(dtoBase)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si la unidad no existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue(null);

      await expect(service.crearDestino(dtoBase)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el funcionario ya está destinado en esa misma unidad', async () => {
      prisma.destinos.findFirst.mockResolvedValue(
        makeAsignacion({ id: 200n, unidad_id: 5n }),
      );

      await expect(service.crearDestino(dtoBase)).rejects.toThrow(ConflictException);
    });

    it('rechaza cuando no se indica ni número de orden ni boletín', async () => {
      const { numero_orden, ...sinOrden } = dtoBase;

      await expect(service.crearDestino(sinOrden as any)).rejects.toThrow(BadRequestException);
    });

    it('acepta boletín en lugar de número de orden', async () => {
      const { numero_orden, ...sinOrden } = dtoBase;

      await expect(
        service.crearDestino({ ...sinOrden, boletin: 'BOL-2026-04' }),
      ).resolves.toBeDefined();
    });

    it('rechaza cerrar el destino anterior antes de su propia fecha de inicio', async () => {
      prisma.destinos.findFirst.mockResolvedValue(
        makeAsignacion({ id: 200n, unidad_id: 9n, fecha_inicio: new Date('2026-01-01') }),
      );

      await expect(
        service.crearDestino({ ...dtoBase, fecha_fin_anterior: '2025-12-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('no crea la asignación nueva si el cierre del anterior es inválido', async () => {
      prisma.destinos.findFirst.mockResolvedValue(
        makeAsignacion({ id: 200n, unidad_id: 9n, fecha_inicio: new Date('2026-01-01') }),
      );

      await expect(
        service.crearDestino({ ...dtoBase, fecha_fin_anterior: '2025-12-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.destinos.create).not.toHaveBeenCalled();
    });
  });

  // ─── listarDestinos ─────────────────────────────────────────────────────────

  describe('listarDestinos', () => {
    beforeEach(() => {
      prisma.destinos.count.mockResolvedValue(0);
      prisma.destinos.findMany.mockResolvedValue([]);
    });

    it('devuelve items paginados con stats globales', async () => {
      prisma.destinos.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
      prisma.destinos.findMany
        .mockResolvedValueOnce([makeAsignacion({ id: 1n }), makeAsignacion({ id: 2n })])
        .mockResolvedValueOnce([{ unidad_id: 5n }, { unidad_id: 9n }]);

      const result = await service.listarDestinos({ page: 1, pageSize: 10 });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.stats.total_destinos).toBe(2);
      expect(result.stats.destinos_activos).toBe(5);
      expect(result.stats.unidades_con_personal).toBe(2);
    });

    it('usa page=1 y pageSize=10 por defecto', async () => {
      await service.listarDestinos();

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('filtra por unidad', async () => {
      await service.listarDestinos({ unidad_id: 5 });

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ unidad_id: 5n }) }),
      );
    });

    it('filtra solo destinos activos', async () => {
      await service.listarDestinos({ activo: true });

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ fecha_fin: null }) }),
      );
    });

    it('filtra solo destinos finalizados', async () => {
      await service.listarDestinos({ activo: false });

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ fecha_fin: { not: null } }) }),
      );
    });

    it('filtra por cedula, nombre o apellido parcial', async () => {
      await service.listarDestinos({ query: 'perez' });

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            personas: {
              OR: [
                { cedula: { contains: 'perez', mode: 'insensitive' } },
                { primer_nombre: { contains: 'perez', mode: 'insensitive' } },
                { primer_apellido: { contains: 'perez', mode: 'insensitive' } },
              ],
            },
          }),
        }),
      );
    });

    it('recorta pageSize al máximo de 200', async () => {
      await service.listarDestinos({ pageSize: 500 });

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('mapea la unidad y marca el destino como activo', async () => {
      prisma.destinos.count.mockResolvedValue(1);
      prisma.destinos.findMany
        .mockResolvedValueOnce([makeAsignacion()])
        .mockResolvedValueOnce([]);

      const result = await service.listarDestinos();

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: '200',
          fecha_inicio: '2024-04-30',
          fecha_fin: null,
          activo: true,
          unidad: expect.objectContaining({ id: '5', denominacion: 'Cuartel General' }),
          persona: expect.objectContaining({ cedula: '12345678' }),
        }),
      );
    });
  });

  // ─── obtenerDestino ─────────────────────────────────────────────────────────

  describe('obtenerDestino', () => {
    it('devuelve el destino mapeado', async () => {
      prisma.destinos.findUnique.mockResolvedValue(makeAsignacion());

      const result: any = await service.obtenerDestino(200);

      expect(result.id).toBe('200');
      expect(result.activo).toBe(true);
    });

    it('rechaza si no existe', async () => {
      prisma.destinos.findUnique.mockResolvedValue(null);

      await expect(service.obtenerDestino(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── editarDestino ──────────────────────────────────────────────────────────

  describe('editarDestino', () => {
    beforeEach(() => {
      prisma.destinos.findUnique.mockResolvedValue(makeAsignacion());
      prisma.destinos.findFirst.mockResolvedValue(null);
      prisma.destinos.update.mockResolvedValue(makeAsignacion());
    });

    it('actualiza el cargo', async () => {
      await service.editarDestino(200, { posicion_destino: 'Jefe de Estado Mayor' });

      expect(prisma.destinos.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 200n },
          data: expect.objectContaining({ posicion_destino: 'Jefe de Estado Mayor' }),
        }),
      );
    });

    it('rechaza si no existe', async () => {
      prisma.destinos.findUnique.mockResolvedValue(null);

      await expect(service.editarDestino(999, { posicion_destino: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza dejar la asignación sin número de orden ni boletín', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeAsignacion({ numero_orden: 'O.D. 1', boletin: null }),
      );

      await expect(service.editarDestino(200, { numero_orden: null })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('cierra el destino al fijar fecha_fin', async () => {
      await service.editarDestino(200, { fecha_fin: '2026-12-31' });

      expect(prisma.destinos.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fecha_fin: new Date('2026-12-31') }),
        }),
      );
    });

    it('rechaza fecha_fin anterior a fecha_inicio', async () => {
      await expect(service.editarDestino(200, { fecha_fin: '2020-01-01' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza reabrir un destino si el funcionario ya tiene otro activo', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeAsignacion({ id: 200n, fecha_fin: new Date('2026-01-01') }),
      );
      prisma.destinos.findFirst.mockResolvedValue(makeAsignacion({ id: 999n }));

      await expect(service.editarDestino(200, { fecha_fin: null })).rejects.toThrow(
        ConflictException,
      );
    });

    it('permite reabrir si no hay otro destino activo', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeAsignacion({ id: 200n, fecha_fin: new Date('2026-01-01') }),
      );
      prisma.destinos.findFirst.mockResolvedValue(null);

      await service.editarDestino(200, { fecha_fin: null });

      expect(prisma.destinos.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ fecha_fin: null }) }),
      );
    });
  });

  // ─── eliminarDestino ────────────────────────────────────────────────────────

  describe('eliminarDestino', () => {
    it('elimina la asignación', async () => {
      prisma.destinos.findUnique.mockResolvedValue(makeAsignacion());
      prisma.destinos.delete.mockResolvedValue(makeAsignacion());

      const result = await service.eliminarDestino(200);

      expect(prisma.destinos.delete).toHaveBeenCalledWith({ where: { id: 200n } });
      expect(result).toEqual({ id: '200', eliminado: true });
    });

    it('rechaza si no existe', async () => {
      prisma.destinos.findUnique.mockResolvedValue(null);

      await expect(service.eliminarDestino(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listarUnidades ─────────────────────────────────────────────────────────

  describe('listarUnidades', () => {
    beforeEach(() => {
      prisma.unidades.count.mockResolvedValue(0);
      prisma.unidades.findMany.mockResolvedValue([]);
    });

    it('devuelve unidades con el total de destinados activos', async () => {
      prisma.unidades.count.mockResolvedValue(1);
      prisma.unidades.findMany.mockResolvedValue([
        { ...makeUnidad(), _count: { destinos: 3 } },
      ]);

      const result = await service.listarUnidades();

      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: '5', denominacion: 'Cuartel General', total_destinados: 3 }),
      );
    });

    it('cuenta solo las asignaciones activas', async () => {
      await service.listarUnidades();

      expect(prisma.unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            _count: { select: { destinos: { where: { fecha_fin: null } } } },
          },
        }),
      );
    });

    it('filtra por denominación parcial', async () => {
      await service.listarUnidades({ query: 'cuartel' });

      expect(prisma.unidades.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            denominacion: { contains: 'cuartel', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  // ─── listarFuncionariosUnidad ───────────────────────────────────────────────

  describe('listarFuncionariosUnidad', () => {
    beforeEach(() => {
      prisma.unidades.findUnique.mockResolvedValue(makeUnidad());
      prisma.destinos.count.mockResolvedValue(0);
      prisma.destinos.findMany.mockResolvedValue([]);
    });

    it('rechaza si la unidad no existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue(null);

      await expect(service.listarFuncionariosUnidad(999)).rejects.toThrow(NotFoundException);
    });

    it('filtra por la unidad pedida', async () => {
      await service.listarFuncionariosUnidad(5);

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ unidad_id: 5n }) }),
      );
    });

    it('permite pedir solo los destinados actualmente', async () => {
      await service.listarFuncionariosUnidad(5, { activo: true });

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ unidad_id: 5n, fecha_fin: null }),
        }),
      );
    });
  });
});

// ─── Validación de DTOs ───────────────────────────────────────────────────────

describe('DTOs de destinos', () => {
  const errores = async (cls: any, payload: object) =>
    (await validate(plainToInstance(cls, payload))).map((e) => e.property);

  describe('CreateDestinoDto', () => {
    const valido = {
      persona_id: 42,
      unidad_id: 5,
      fecha_inicio: '2026-09-01',
      numero_orden: 'O.D. 12455',
    };

    it('acepta un destino con número de orden', async () => {
      expect(await errores(CreateDestinoDto, valido)).toEqual([]);
    });

    it('acepta un destino con boletín en lugar de número de orden', async () => {
      const { numero_orden, ...sinOrden } = valido;

      expect(await errores(CreateDestinoDto, { ...sinOrden, boletin: 'BOL-2026-04' })).toEqual([]);
    });

    it('rechaza cuando no hay ni número de orden ni boletín', async () => {
      const { numero_orden, ...sinOrden } = valido;

      expect(await errores(CreateDestinoDto, sinOrden)).toEqual(
        expect.arrayContaining(['numero_orden', 'boletin']),
      );
    });

    it('rechaza si falta la unidad', async () => {
      const { unidad_id, ...sinUnidad } = valido;

      expect(await errores(CreateDestinoDto, sinUnidad)).toContain('unidad_id');
    });

    it('rechaza si falta la fecha de inicio', async () => {
      const { fecha_inicio, ...sinFecha } = valido;

      expect(await errores(CreateDestinoDto, sinFecha)).toContain('fecha_inicio');
    });

    it('rechaza una fecha de inicio que no es ISO 8601', async () => {
      expect(await errores(CreateDestinoDto, { ...valido, fecha_inicio: '01/09/2026' })).toContain(
        'fecha_inicio',
      );
    });

    it('rechaza persona_id no entero', async () => {
      expect(await errores(CreateDestinoDto, { ...valido, persona_id: 'abc' })).toContain(
        'persona_id',
      );
    });

    it('rechaza numero_orden que excede 50 caracteres', async () => {
      expect(await errores(CreateDestinoDto, { ...valido, numero_orden: 'x'.repeat(51) })).toContain(
        'numero_orden',
      );
    });

    it('acepta fecha_fin_anterior opcional', async () => {
      expect(await errores(CreateDestinoDto, { ...valido, fecha_fin_anterior: '2026-08-15' })).toEqual(
        [],
      );
    });
  });

  describe('UpdateDestinoDto', () => {
    it('acepta objeto vacío (todos opcionales)', async () => {
      expect(await errores(UpdateDestinoDto, {})).toEqual([]);
    });

    it('acepta fecha_fin en null para reabrir el destino', async () => {
      expect(await errores(UpdateDestinoDto, { fecha_fin: null })).toEqual([]);
    });

    it('rechaza fecha_fin con formato inválido', async () => {
      expect(await errores(UpdateDestinoDto, { fecha_fin: '31-12-2026' })).toContain('fecha_fin');
    });

    it('rechaza posicion_destino que excede 200 caracteres', async () => {
      expect(await errores(UpdateDestinoDto, { posicion_destino: 'x'.repeat(201) })).toContain(
        'posicion_destino',
      );
    });
  });
});

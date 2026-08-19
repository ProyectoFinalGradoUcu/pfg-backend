import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SubalternosService } from './subalternos.service';

describe('SubalternosService', () => {
  let service: SubalternosService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      personas: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 1n, cedula: '12345678' }),
        update: jest.fn().mockResolvedValue({
          id: 1n,
          cedula: '12345678',
          direccion: 'Av. Italia 1234',
          telefono: '099123456',
        }),
        delete: jest.fn(),
      },
      relaciones_laborales: {
        // Con los catálogos incluidos, como los devuelve el `include` del create.
        create: jest.fn().mockResolvedValue({
          id: 10n,
          estado: 'activo',
          tipo_funcionario: 'subalterno',
          escalafones: { denominacion: 'Comando y Aire' },
          grados: { denominacion: 'Sargento' },
          unidades: { denominacion: 'Brigada Aérea I' },
          programas: { denominacion: 'Programa 001' },
          situaciones: { denominacion: 'Actividad' },
          regimenes: { denominacion: 'Militar' },
          sub_unidades: null,
        }),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    service = new SubalternosService(prisma);
  });

  const dto = {
    cedula: '12345678',
    primer_nombre: 'Juan',
    primer_apellido: 'Perez',
    fecha_inicio: '2024-01-15',
    regimen_id: 1,
    unidad_id: 1,
    programa_id: 1,
    situacion_id: 1,
    escalafon_id: 1,
    grado_id: 6,
  };

  // ─── findAllPersonas ────────────────────────────────────────────────────────
  // El campo `destino` sale del módulo de destinos (la fila vigente de la tabla
  // `destinos`), no de la unidad de la relación laboral: esa última la escribe
  // liquidación y el seed, y no refleja dónde revista el funcionario.

  describe('findAllPersonas · destino', () => {
    const makePersona = (overrides: any = {}) => ({
      id: 1n,
      cedula: '41234567',
      primer_nombre: 'Martín',
      segundo_nombre: null,
      primer_apellido: 'González',
      segundo_apellido: null,
      relaciones_laborales: [
        {
          grados: { denominacion: 'Sargento' },
          situaciones: { denominacion: 'Actividad' },
        },
      ],
      destinos: [{ unidades: { denominacion: 'E.M.G.F.A.' } }],
      ...overrides,
    });

    beforeEach(() => {
      prisma.personas.count = jest.fn().mockResolvedValue(1);
      prisma.personas.findMany = jest.fn().mockResolvedValue([makePersona()]);
    });

    it('toma el destino de la tabla destinos', async () => {
      const result = await service.findAllPersonas({});

      expect(result.items[0].destino).toBe('E.M.G.F.A.');
    });

    it('devuelve null cuando el funcionario no tiene destino cargado', async () => {
      prisma.personas.findMany.mockResolvedValue([makePersona({ destinos: [] })]);

      const result = await service.findAllPersonas({});

      expect(result.items[0].destino).toBeNull();
    });

    it('no cae a la unidad de la relación laboral cuando no hay destino', async () => {
      prisma.personas.findMany.mockResolvedValue([
        makePersona({
          destinos: [],
          relaciones_laborales: [
            {
              grados: { denominacion: 'Sargento' },
              situaciones: { denominacion: 'Actividad' },
              unidades: { denominacion: 'Cuartel General' },
            },
          ],
        }),
      ]);

      const result = await service.findAllPersonas({});

      expect(result.items[0].destino).toBeNull();
    });

    it('pide solo el destino vigente y el más reciente', async () => {
      await service.findAllPersonas({});

      const { select } = prisma.personas.findMany.mock.calls[0][0];

      expect(select.destinos).toEqual(
        expect.objectContaining({
          where: { fecha_fin: null },
          orderBy: { fecha_inicio: 'desc' },
          take: 1,
        }),
      );
    });

    it('rango y estado siguen saliendo de la relación laboral', async () => {
      const result = await service.findAllPersonas({});

      expect(result.items[0].rango).toBe('Sargento');
      expect(result.items[0].estado).toBe('Actividad');
    });
  });

  describe('findAllPersonas · filtro por destino', () => {
    beforeEach(() => {
      prisma.personas.count = jest.fn().mockResolvedValue(0);
      prisma.personas.findMany = jest.fn().mockResolvedValue([]);
    });

    it('filtra por la unidad del destino vigente', async () => {
      await service.findAllPersonas({ destino: 5 });

      const { where } = prisma.personas.findMany.mock.calls[0][0];

      expect(where.destinos).toEqual({
        some: { unidad_id: 5n, fecha_fin: null },
      });
    });

    it('ya no filtra por la unidad de la relación laboral', async () => {
      await service.findAllPersonas({ destino: 5 });

      const { where } = prisma.personas.findMany.mock.calls[0][0];

      expect(where.relaciones_laborales.some).not.toHaveProperty('unidad_id');
    });

    it('sin filtro de destino no restringe por destinos', async () => {
      await service.findAllPersonas({});

      const { where } = prisma.personas.findMany.mock.calls[0][0];

      expect(where).not.toHaveProperty('destinos');
    });

    it('mantiene los filtros de estado y rango en la relación laboral', async () => {
      await service.findAllPersonas({ estado: 2, rango: 6 });

      const { where } = prisma.personas.findMany.mock.calls[0][0];

      expect(where.relaciones_laborales.some).toEqual(
        expect.objectContaining({
          fecha_fin: null,
          situacion_id: 2n,
          grado_id: 6n,
        }),
      );
    });
  });

  describe('create', () => {
    it('Crea persona y su relación laboral como subalterno', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.create(dto);
      expect(r.relacion_laboral.tipo_funcionario).toBe('subalterno');
    });

    it('Falla si la cédula ya existe', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 99n });
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('Falla si la fecha de inicio es anterior a la de nacimiento', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ ...dto, fecha_nacimiento: '2025-06-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.personas.create).not.toHaveBeenCalled();
    });

    it('Acepta una fecha de inicio posterior a la de nacimiento', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.create({ ...dto, fecha_nacimiento: '1990-05-15' });
      expect(r.relacion_laboral.tipo_funcionario).toBe('subalterno');
    });
  });

  describe('createPersonal', () => {
    const dtoMilitar = {
      ...dto,
      es_civil: false,
      tipo_funcionario: 'subalterno',
    };

    it('Falla si la fecha de inicio es anterior a la de nacimiento', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await expect(
        service.createPersonal({ ...dtoMilitar, fecha_nacimiento: '2025-06-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.personas.create).not.toHaveBeenCalled();
    });

    it('Acepta una fecha de inicio posterior a la de nacimiento', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.createPersonal({
        ...dtoMilitar,
        fecha_nacimiento: '1990-05-15',
      });
      expect((r as any).relacion_laboral.tipo_funcionario).toBe('subalterno');
    });

    it('Devuelve los catálogos resueltos por nombre, no solo los ids', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.createPersonal(dtoMilitar);
      expect((r as any).relacion_laboral).toMatchObject({
        grado: 'Sargento',
        unidad: 'Brigada Aérea I',
        escalafon: 'Comando y Aire',
        programa: 'Programa 001',
        situacion: 'Actividad',
        regimen: 'Militar',
        sub_unidad: null,
      });
    });
  });

  describe('update', () => {
    it('Actualiza dirección y teléfono', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });
      const r = await service.update(1, {
        direccion: 'Av. Italia 1234',
        telefono: '099123456',
      });
      expect(r.direccion).toBe('Av. Italia 1234');
      expect(r.telefono).toBe('099123456');
    });

    it('Error porque no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await expect(service.update(999, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('Borra relaciones laborales y persona', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });
      const r = await service.remove(1);
      expect(r).toEqual({ id: 1, eliminado: true });
      expect(prisma.relaciones_laborales.deleteMany).toHaveBeenCalled();
      expect(prisma.personas.delete).toHaveBeenCalled();
    });

    it('Error porque no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Alcance por unidad (spec 002) ─────────────────────────────────────────

  describe('alcance por unidad', () => {
    const UNIDAD: any = { tipo: 'unidad', unidadIds: ['7'] };
    const GLOBAL: any = { tipo: 'global' };

    beforeEach(() => {
      prisma.personas.count = jest.fn().mockResolvedValue(0);
      prisma.personas.findMany = jest.fn().mockResolvedValue([]);
    });

    it('fuerza la unidad propia en el listado e ignora el filtro destino del query', async () => {
      await service.findAllPersonas({ destino: '99' } as any, UNIDAD);

      expect(prisma.personas.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            relaciones_laborales: { some: { fecha_fin: null, unidad_id: { in: [7n] } } },
          }),
        }),
      );
    });

    it('respeta el filtro destino del query con alcance global', async () => {
      await service.findAllPersonas({ destino: '99' } as any, GLOBAL);

      expect(prisma.personas.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            relaciones_laborales: { some: { fecha_fin: null, unidad_id: 99n } },
          }),
        }),
      );
    });

    it('no filtra por unidad si no se pasa alcance (regresion del comportamiento previo)', async () => {
      await service.findAllPersonas({} as any);

      expect(prisma.personas.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            relaciones_laborales: { some: { fecha_fin: null } },
          }),
        }),
      );
    });

    it('rechaza dar de alta personal en una unidad ajena', async () => {
      await expect(
        service.create({ ...dto, unidad_id: 99 } as any, UNIDAD),
      ).rejects.toThrow(BadRequestException);
    });

    it('fuerza la unidad propia al dar de alta sin declararla', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await service.create({ ...dto, unidad_id: undefined } as any, UNIDAD);

      expect(prisma.relaciones_laborales.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unidad_id: 7n }),
        }),
      );
    });

    it('devuelve NotFoundException al editar una persona de otra unidad', async () => {
      prisma.personas.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.update(1, {}, UNIDAD)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('permite eliminar una persona de la propia unidad', async () => {
      prisma.personas.findFirst = jest.fn().mockResolvedValue({ id: 1n });
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });

      // No se invalida ninguna sesion: la unidad del usuario del sistema es
      // independiente del destino del funcionario (spec 002 §3).
      await expect(service.remove(1, UNIDAD)).resolves.toBeDefined();
    });
  });
});

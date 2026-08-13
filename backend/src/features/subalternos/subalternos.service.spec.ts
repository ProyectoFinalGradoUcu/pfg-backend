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
      expect(r.relacion_laboral.tipo_funcionario).toBe('subalterno');
    });

    it('Devuelve los catálogos resueltos por nombre, no solo los ids', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.createPersonal(dtoMilitar);
      expect(r.relacion_laboral).toMatchObject({
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
    const UNIDAD: any = { tipo: 'unidad', unidadId: '7' };
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
            relaciones_laborales: { some: { fecha_fin: null, unidad_id: 7n } },
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

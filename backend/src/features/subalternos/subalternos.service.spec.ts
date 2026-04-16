import { ConflictException, NotFoundException } from '@nestjs/common';
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
        create: jest.fn().mockResolvedValue({
          id: 10n,
          estado: 'activo',
          tipo_funcionario: 'subalterno',
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
});

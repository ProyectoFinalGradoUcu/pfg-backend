import { AuditoriaService } from './auditoria.service';

describe('AuditoriaService', () => {
  let service: AuditoriaService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      acciones: { findUnique: jest.fn().mockResolvedValue({ id: 1n }) },
      contextos: { findUnique: jest.fn().mockResolvedValue({ id: 2n }) },
      bitacora_auditoria: { create: jest.fn().mockResolvedValue({ id: 99n }) },
    };
    service = new AuditoriaService(prisma);
  });

  const detalleGuardado = () =>
    prisma.bitacora_auditoria.create.mock.calls[0][0].data.detalle;

  const registrar = (detalle: unknown) =>
    service.registrar({
      usuarioId: 1,
      accion: 'CREAR',
      contexto: 'Personas',
      detalle,
    });

  describe('sanitización del detalle', () => {
    it('Serializa las fechas en ISO en vez de vaciarlas', async () => {
      await registrar({ fecha_inicio: new Date('2024-01-15T00:00:00.000Z') });
      expect(detalleGuardado()).toEqual({ fecha_inicio: '2024-01-15T00:00:00.000Z' });
    });

    it('Convierte BigInt a string', async () => {
      await registrar({ id: 42n });
      expect(detalleGuardado()).toEqual({ id: '42' });
    });

    it('Oculta los campos sensibles a cualquier profundidad', async () => {
      await registrar({ body: { username: 'jperez', password: 'secreto' } });
      expect(detalleGuardado()).toEqual({
        body: { username: 'jperez', password: '***' },
      });
    });

    it('Recorre arrays y objetos anidados', async () => {
      await registrar({
        resultado: { familiares: [{ cedula: '123', alta: new Date('2020-03-01T00:00:00.000Z') }] },
      });
      expect(detalleGuardado()).toEqual({
        resultado: { familiares: [{ cedula: '123', alta: '2020-03-01T00:00:00.000Z' }] },
      });
    });
  });

  describe('validación contra los catálogos', () => {
    it('No registra nada si la acción no existe', async () => {
      prisma.acciones.findUnique.mockResolvedValue(null);
      await registrar({ algo: 1 });
      expect(prisma.bitacora_auditoria.create).not.toHaveBeenCalled();
    });

    it('No registra nada si el contexto no existe', async () => {
      prisma.contextos.findUnique.mockResolvedValue(null);
      await registrar({ algo: 1 });
      expect(prisma.bitacora_auditoria.create).not.toHaveBeenCalled();
    });
  });
});

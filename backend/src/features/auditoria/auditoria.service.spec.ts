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
      usuarioId: '1',
      accion: 'CREAR',
      contexto: 'Personas',
      detalle,
    });

  describe('filtros', () => {
    beforeEach(() => {
      prisma.acciones.findMany = jest.fn().mockResolvedValue([]);
      prisma.contextos.findMany = jest.fn().mockResolvedValue([]);
      prisma.usuarios = {
        findMany: jest.fn().mockResolvedValue([
          { id: 1n, username: 'activo@fau.mil.uy' },
          { id: 2n, username: 'bloqueado@fau.mil.uy' },
        ]),
      };
    });

    it('ofrece los usuarios de la aplicación sin filtrar por estado, para incluir a los bloqueados', async () => {
      const { usuarios } = await service.filtros();

      expect(usuarios).toEqual([
        { id: '1', username: 'activo@fau.mil.uy' },
        { id: '2', username: 'bloqueado@fau.mil.uy' },
      ]);
      expect(prisma.usuarios.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aplicacion: 'personal' }, orderBy: { username: 'asc' } }),
      );
    });

    it('solo expone id y username', async () => {
      await service.filtros();

      expect(prisma.usuarios.findMany.mock.calls[0][0].select).toEqual({ id: true, username: true });
    });
  });

  describe('listar', () => {
    beforeEach(() => {
      prisma.bitacora_auditoria.count = jest.fn().mockResolvedValue(0);
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([]);
      prisma.$transaction = jest.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones));
    });

    it('combina usuario, acción, contexto y período, y el total respeta los mismos filtros', async () => {
      await service.listar({
        usuarioId: '7',
        accion: 'CREAR',
        contexto: 'Roles',
        desde: '2026-01-01',
        hasta: '2026-01-31',
        page: 2,
        pageSize: 20,
      });

      const args = prisma.bitacora_auditoria.findMany.mock.calls[0][0];
      expect(args.where).toEqual(
        expect.objectContaining({
          usuario_id: 7n,
          acciones: { nombre: 'CREAR' },
          contextos: { nombre: 'Roles' },
          fecha: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
        }),
      );
      expect(args.skip).toBe(20);
      expect(prisma.bitacora_auditoria.count).toHaveBeenCalledWith({ where: args.where });
    });

    it('un día sin hora se interpreta en hora de Uruguay (UTC-3), no en UTC', async () => {
      await service.listar({ desde: '2026-10-20', hasta: '2026-10-20' });

      const { fecha } = prisma.bitacora_auditoria.findMany.mock.calls[0][0].where;
      expect(fecha.gte.toISOString()).toBe('2026-10-20T03:00:00.000Z');
      expect(fecha.lte.toISOString()).toBe('2026-10-21T02:59:59.999Z');
    });

    it('sin usuario no filtra por usuario', async () => {
      await service.listar({});

      expect(prisma.bitacora_auditoria.findMany.mock.calls[0][0].where).not.toHaveProperty('usuario_id');
    });
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

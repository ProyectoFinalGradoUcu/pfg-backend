import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CatalogoUnidadesService } from './catalogo-unidades.service';
import { CreateComandoDto } from './dto/comando.dto';
import { CreateBaseDto, UpdateBaseDto } from './dto/base.dto';

const CAO = { id: 1n, codigo: 'CAO', denominacion: 'C.A.O.', vigente: true };
const CAP = { id: 2n, codigo: 'CAP', denominacion: 'C.A.P.', vigente: true };
const BAI = { id: 10n, unidad_id: 1n, codigo: 'BAI', denominacion: 'B.A.I.', vigente: true, unidades: CAO };

const makePrisma = () => ({
  unidades: {
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  sub_unidades: {
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  relaciones_laborales: { count: jest.fn().mockResolvedValue(0) },
  destinos: { count: jest.fn().mockResolvedValue(0) },
  cursos: { count: jest.fn().mockResolvedValue(0) },
});

describe('CatalogoUnidadesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CatalogoUnidadesService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CatalogoUnidadesService(prisma as any);
  });

  // ─── Comandos ──────────────────────────────────────────────────────────────

  describe('crearComando', () => {
    it('crea el comando vigente', async () => {
      prisma.unidades.create.mockResolvedValue({ ...CAO, id: 5n, codigo: 'CNUEVO', denominacion: 'C.NUEVO' });

      const res = await service.crearComando({ codigo: 'CNUEVO', denominacion: 'C.NUEVO' });

      expect(prisma.unidades.create).toHaveBeenCalledWith({
        data: { codigo: 'CNUEVO', denominacion: 'C.NUEVO', vigente: true },
      });
      expect(res).toEqual({ id: 5, codigo: 'CNUEVO', denominacion: 'C.NUEVO', vigente: true, total_bases: 0 });
    });

    it('rechaza un código de comando repetido', async () => {
      prisma.unidades.findFirst.mockResolvedValueOnce(CAO);

      await expect(service.crearComando({ codigo: 'cao', denominacion: 'Otro' })).rejects.toThrow(ConflictException);
      expect(prisma.unidades.create).not.toHaveBeenCalled();
    });

    it('rechaza cargar como comando el código de una base existente', async () => {
      prisma.sub_unidades.findFirst.mockResolvedValueOnce({ denominacion: 'B.A.I.', unidades: CAO });

      await expect(service.crearComando({ codigo: 'BAI', denominacion: 'Base Aérea I' })).rejects.toThrow(
        /ya es de la base B\.A\.I\. \(C\.A\.O\.\)/,
      );
      expect(prisma.unidades.create).not.toHaveBeenCalled();
    });

    it('rechaza una denominación repetida', async () => {
      prisma.unidades.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(CAO);

      await expect(service.crearComando({ codigo: 'NUEVO', denominacion: 'c.a.o.' })).rejects.toThrow(
        /Ya existe un comando/,
      );
    });
  });

  describe('editarComando', () => {
    beforeEach(() => {
      prisma.unidades.findUnique.mockResolvedValue(CAO);
      prisma.unidades.update.mockImplementation(({ data }) => Promise.resolve({ ...CAO, ...data }));
    });

    it('404 si no existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue(null);

      await expect(service.editarComando(99, { denominacion: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('cambia la denominación', async () => {
      const res = await service.editarComando(1, { denominacion: 'Comando Aéreo de Operaciones' });

      expect(prisma.unidades.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { denominacion: 'Comando Aéreo de Operaciones' },
      });
      expect(res.denominacion).toBe('Comando Aéreo de Operaciones');
    });

    it('no da de baja un comando con bases vigentes', async () => {
      prisma.sub_unidades.count.mockResolvedValue(3);

      await expect(service.editarComando(1, { vigente: false })).rejects.toThrow(/3 bases vigentes/);
      expect(prisma.unidades.update).not.toHaveBeenCalled();
    });

    it('no da de baja un comando con relaciones laborales activas', async () => {
      prisma.relaciones_laborales.count.mockResolvedValue(1);

      await expect(service.editarComando(1, { vigente: false })).rejects.toThrow(/liquidación/);
      expect(prisma.relaciones_laborales.count).toHaveBeenCalledWith({
        where: { unidad_id: 1n, fecha_fin: null },
      });
    });

    it('da de baja un comando sin uso', async () => {
      await service.editarComando(1, { vigente: false });

      expect(prisma.unidades.update).toHaveBeenCalledWith({ where: { id: 1n }, data: { vigente: false } });
    });
  });

  // ─── Bases ─────────────────────────────────────────────────────────────────

  describe('crearBase', () => {
    beforeEach(() => {
      prisma.unidades.findUnique.mockResolvedValue(CAO);
      prisma.sub_unidades.create.mockImplementation(({ data }) => Promise.resolve({ id: 30n, ...data }));
    });

    it('crea la base dentro del comando', async () => {
      const res = await service.crearBase({ unidad_id: 1, codigo: 'BAIV', denominacion: 'B.A.IV.' });

      expect(prisma.sub_unidades.create).toHaveBeenCalledWith({
        data: { unidad_id: 1n, codigo: 'BAIV', denominacion: 'B.A.IV.', vigente: true },
      });
      expect(res).toEqual({
        id: 30,
        codigo: 'BAIV',
        denominacion: 'B.A.IV.',
        vigente: true,
        unidad_id: 1,
        comando: { id: 1, codigo: 'CAO', denominacion: 'C.A.O.' },
      });
    });

    it('rechaza un comando inexistente o dado de baja', async () => {
      prisma.unidades.findUnique.mockResolvedValue({ ...CAO, vigente: false });

      await expect(service.crearBase({ unidad_id: 1, codigo: 'X', denominacion: 'X' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('rechaza un código que ya usa una base de otro comando', async () => {
      prisma.sub_unidades.findFirst.mockResolvedValueOnce({ denominacion: 'B.A.I.', unidades: CAO });

      await expect(service.crearBase({ unidad_id: 2, codigo: 'BAI', denominacion: 'Otra' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.sub_unidades.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { codigo: { equals: 'BAI', mode: 'insensitive' } } }),
      );
    });

    it('rechaza un código que ya es de un comando', async () => {
      prisma.unidades.findFirst.mockResolvedValueOnce(CAP);

      await expect(service.crearBase({ unidad_id: 1, codigo: 'CAP', denominacion: 'X' })).rejects.toThrow(
        /ya es del comando/,
      );
    });

    it('rechaza una denominación de base repetida', async () => {
      prisma.sub_unidades.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ unidades: CAO });

      await expect(service.crearBase({ unidad_id: 1, codigo: 'NUEVA', denominacion: 'b.a.i.' })).rejects.toThrow(
        /Ya existe una base llamada/,
      );
    });
  });

  describe('editarBase', () => {
    beforeEach(() => {
      prisma.sub_unidades.findUnique.mockResolvedValue(BAI);
      prisma.sub_unidades.update.mockImplementation(({ data }) => Promise.resolve({ ...BAI, ...data }));
    });

    it('404 si no existe', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue(null);

      await expect(service.editarBase(99, { denominacion: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('mueve de comando una base que nunca se usó', async () => {
      prisma.unidades.findUnique.mockResolvedValue(CAP);

      const res = await service.editarBase(10, { unidad_id: 2 });

      expect(prisma.sub_unidades.update).toHaveBeenCalledWith({ where: { id: 10n }, data: { unidad_id: 2n } });
      expect(res.comando).toEqual({ id: 2, codigo: 'CAP', denominacion: 'C.A.P.' });
    });

    it.each(['relaciones_laborales', 'destinos', 'cursos'] as const)(
      'no mueve de comando una base que ya tiene %s, aunque sean históricos',
      async (tabla) => {
        prisma.unidades.findUnique.mockResolvedValue(CAP);
        prisma[tabla].count.mockResolvedValue(1);

        await expect(service.editarBase(10, { unidad_id: 2 })).rejects.toThrow(/No se puede cambiar el comando/);
        expect(prisma[tabla].count).toHaveBeenCalledWith({ where: { sub_unidad_id: 10n } });
        expect(prisma.sub_unidades.update).not.toHaveBeenCalled();
      },
    );

    it('mandar el mismo comando no cuenta como cambio', async () => {
      prisma.relaciones_laborales.count.mockResolvedValue(5);

      await service.editarBase(10, { unidad_id: 1, denominacion: 'Base Aérea I' });

      expect(prisma.sub_unidades.update).toHaveBeenCalledWith({
        where: { id: 10n },
        data: { denominacion: 'Base Aérea I' },
      });
    });

    it('no da de baja una base con destinos vigentes', async () => {
      prisma.destinos.count.mockResolvedValue(2);

      await expect(service.editarBase(10, { vigente: false })).rejects.toThrow(/2 funcionarios con destino vigente/);
      expect(prisma.destinos.count).toHaveBeenCalledWith({ where: { sub_unidad_id: 10n, fecha_fin: null } });
    });

    it('no da de baja una base con relaciones laborales activas', async () => {
      prisma.relaciones_laborales.count.mockResolvedValue(1);

      await expect(service.editarBase(10, { vigente: false })).rejects.toThrow(/liquidación/);
    });

    it('no reactiva una base si su comando está dado de baja', async () => {
      prisma.sub_unidades.findUnique.mockResolvedValue({
        ...BAI,
        vigente: false,
        unidades: { ...CAO, vigente: false },
      });

      await expect(service.editarBase(10, { vigente: true })).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ─── DTOs ──────────────────────────────────────────────────────────────────

  describe('DTOs', () => {
    it('normaliza el código a mayúsculas sin espacios y recorta la denominación', async () => {
      const dto = plainToInstance(CreateComandoDto, { codigo: '  cnuevo ', denominacion: '  C.NUEVO  ' });

      expect(await validate(dto)).toHaveLength(0);
      expect(dto).toEqual({ codigo: 'CNUEVO', denominacion: 'C.NUEVO' });
    });

    it('una base exige comando', async () => {
      const errores = await validate(plainToInstance(CreateBaseDto, { codigo: 'X', denominacion: 'X' }));

      expect(errores.map((e) => e.property)).toContain('unidad_id');
    });

    it('la edición de una base no acepta código', async () => {
      const dto = plainToInstance(UpdateBaseDto, { codigo: 'OTRO' });

      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
    });
  });
});

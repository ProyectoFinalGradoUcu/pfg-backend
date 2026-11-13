import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ComisionesService } from './comisiones.service';
import { PrismaService } from '../../lib/prisma.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAsignacionComisionDto, CreateLoteAsignacionesComisionDto } from './dto/comisiones.dto';

const registro = (changes = {}) => ({
  id: 10n, persona_id: 1n, comision_id: 2n,
  fecha_inicio: new Date('2026-01-01'), fecha_fin: null,
  numero_orden: '001', boletin: null,
  cargo: null,
  importada: false, relacion_laboral_id: null, texto_original: null, relaciones_laborales: null,
  personas: { id: 1n, cedula: '123', primer_nombre: 'Ana', primer_apellido: 'Pérez', retiros: [], relaciones_laborales: [{ tipo_funcionario: 'oficial', fecha_fin: null }] },
  comisiones: { id: 2n, denominacion: 'Evaluación', vigente: true },
  ...changes,
});

const lote = { persona_ids: [1, 2], comision_id: 2, fecha_inicio: '2026-02-01', numero_orden: '001', boletin: 'B-001' };

describe('ComisionesService', () => {
  let service: ComisionesService;
  let tx: any;
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 2n, vigente: true }]),
      personas: {
        findUnique: jest.fn().mockResolvedValue({ id: 1n }),
        // La consulta de retirados (filtra por `retiros`) no encuentra a nadie por defecto.
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(where.retiros ? [] : [{ id: 1n }, { id: 2n }]),
        ),
      },
      comisiones: { update: jest.fn() },
      relaciones_laborales: { findUnique: jest.fn() },
      asignaciones_comision: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(registro()),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(registro(data))),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(registro(data))),
      },
    };
    const prisma = { $transaction: jest.fn().mockImplementation(fn => fn(tx)) };
    service = new ComisionesService(prisma as unknown as PrismaService);
  });
  it('asigna sin cerrar otras comisiones ni modificar destinos', async () => {
    const result = await service.crearAsignacion({ persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', boletin: 'B-001' });
    expect(result.activo).toBe(true);
    expect(tx.asignaciones_comision.update).not.toHaveBeenCalled();
    expect(tx.asignaciones_comision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ persona_id: 1n, comision_id: 2n, boletin: 'B-001' }) }));
  });
  describe('solapamientos y alcance', () => {
    const dto = { persona_id: 1, comision_id: 2, fecha_inicio: '2026-03-01', fecha_fin: '2026-05-01', boletin: 'OTRO', cargo: 'Presidente' };
    it('mantiene activa una pertenencia con cierre futuro', async () => {
      const result = await service.crearAsignacion({ ...dto, fecha_fin: '2099-12-31' });
      expect(result.activo).toBe(true);
    });
    it('impide inactivar con pertenencias vigentes o futuras', async () => {
      tx.asignaciones_comision.count.mockResolvedValue(1);
      await expect(service.editar(2n, { vigente: false })).rejects.toThrow(ConflictException);
      expect(tx.asignaciones_comision.count.mock.calls[0][0].where.OR).toEqual([
        { fecha_fin: null }, { fecha_fin: { gte: expect.any(Date) } },
      ]);
    });
    it.each([
      [null, 'pertenencia abierta'],
      [new Date('2026-03-01'), 'día límite compartido'],
      [new Date('2026-04-01'), 'período parcial'],
    ])('rechaza %s (%s) aunque cambien documentos y cargo', async (fin) => {
      tx.asignaciones_comision.findMany.mockResolvedValue([registro({ fecha_fin: fin })]);
      await expect(service.crearAsignacion(dto)).rejects.toThrow(ConflictException);
      expect(tx.asignaciones_comision.create).not.toHaveBeenCalled();
    });
    it('acepta un período que comienza después del fin anterior', async () => {
      tx.asignaciones_comision.findMany.mockResolvedValue([registro({ fecha_fin: new Date('2026-02-28') })]);
      await expect(service.crearAsignacion(dto)).resolves.toBeDefined();
    });
    it('rechaza solapamientos en un lote con fecha de fin sin escribir ninguna fila', async () => {
      tx.asignaciones_comision.findMany.mockResolvedValue([registro()]);
      await expect(service.crearLote({ ...lote, fecha_fin: '2026-06-01' })).rejects.toThrow(ConflictException);
      expect(tx.asignaciones_comision.create).not.toHaveBeenCalled();
    });
    it('valida el estado final al editar y excluye la propia asignación', async () => {
      tx.asignaciones_comision.findMany.mockResolvedValue([registro({ id: 11n, fecha_inicio: new Date('2026-06-01') })]);
      await expect(service.editarAsignacion(10n, { fecha_fin: '2026-06-01' })).rejects.toThrow(ConflictException);
      expect(tx.asignaciones_comision.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { comision_id: 2n, persona_id: { in: [1n] }, id: { not: 10n } } }));
    });
    it('no permite extender hasta el futuro una pertenencia de un retirado', async () => {
      tx.asignaciones_comision.findUnique.mockResolvedValue(registro({ fecha_fin: new Date('2026-03-01') }));
      tx.personas.findMany.mockResolvedValue([{ primer_nombre: 'Ana', primer_apellido: 'Pérez', cedula: '123' }]);
      await expect(service.editarAsignacion(10n, { fecha_fin: '2099-01-01' })).rejects.toThrow(ConflictException);
      expect(tx.asignaciones_comision.update).not.toHaveBeenCalled();
    });
    it.each(['crear', 'editar', 'eliminar', 'lote'])('rechaza %s fuera de alcance sin escrituras', async accion => {
      tx.personas.findMany.mockResolvedValue([]);
      const alcance = { tipo: 'unidad' as const, subUnidadIds: ['7'], comandoIds: ['1'] };
      const promesa = accion === 'crear' ? service.crearAsignacion(dto, alcance)
        : accion === 'editar' ? service.editarAsignacion(10n, { cargo: 'Vocal' }, alcance)
        : accion === 'eliminar' ? service.eliminarAsignacion(10n, alcance)
        : service.crearLote(lote, alcance);
      await expect(promesa).rejects.toThrow(NotFoundException);
      expect(tx.asignaciones_comision.create).not.toHaveBeenCalled();
      expect(tx.asignaciones_comision.update).not.toHaveBeenCalled();
    });
  });
  describe('un retirado no puede integrar una comisión', () => {
    const retirada = { primer_nombre: 'Ana', primer_apellido: 'Pérez', cedula: '123' };
    const conRetirados = (lista: object[]) =>
      tx.personas.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where.retiros ? lista : [{ id: 1n }, { id: 2n }]),
      );

    it('rechaza asignar a un retirado', async () => {
      conRetirados([retirada]);
      await expect(
        service.crearAsignacion({ persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', boletin: 'B-001' }),
      ).rejects.toThrow('Ana Pérez (123) está retirado');
      expect(tx.asignaciones_comision.create).not.toHaveBeenCalled();
    });

    it('en un lote con un retirado no crea ninguna', async () => {
      conRetirados([retirada]);
      await expect(service.crearLote(lote)).rejects.toThrow(ConflictException);
      expect(tx.asignaciones_comision.create).not.toHaveBeenCalled();
    });

    it('busca retiro no anulado y sin relación laboral activa (un reincorporado sí puede)', async () => {
      await service.crearAsignacion({ persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', boletin: 'B-001' });
      const consulta = tx.personas.findMany.mock.calls.find(([q]: any) => q.where.retiros)[0];
      expect(consulta.where).toMatchObject({
        retiros: { some: { anulado: false } },
        relaciones_laborales: { none: { fecha_fin: null } },
      });
    });

    it('no deja reabrir la pertenencia de un retirado', async () => {
      tx.asignaciones_comision.findUnique.mockResolvedValue(registro({ fecha_fin: new Date('2026-03-01') }));
      conRetirados([retirada]);
      await expect(service.editarAsignacion(10n, { fecha_fin: null } as any)).rejects.toThrow(ConflictException);
      expect(tx.asignaciones_comision.update).not.toHaveBeenCalled();
    });
  });

  it('rechaza documentos en blanco', async () => {
    await expect(service.crearAsignacion({ persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', boletin: '  ' })).rejects.toThrow(BadRequestException);
  });
  it('crea un lote con documentos compartidos y sin cargo', async () => {
    const result = await service.crearLote(lote);
    expect(result.cantidad).toBe(2);
    expect(result.items.every(a => a.numero_orden === '001' && a.boletin === 'B-001' && a.cargo === null)).toBe(true);
    expect(tx.asignaciones_comision.create).toHaveBeenCalledTimes(2);
  });
  it('rechaza un cargo compartido entre varias personas', async () => {
    await expect(service.crearLote({ ...lote, cargo: 'Vocal' })).rejects.toThrow(BadRequestException);
    expect(tx.asignaciones_comision.create).not.toHaveBeenCalled();
  });
  it('no crea ninguna asignación si una persona ya tiene pertenencia abierta', async () => {
    tx.asignaciones_comision.findMany.mockResolvedValue([{ personas: { primer_nombre: 'Ana', primer_apellido: 'Pérez', cedula: '123' } }]);
    await expect(service.crearLote(lote)).rejects.toThrow(ConflictException);
    expect(tx.asignaciones_comision.create).not.toHaveBeenCalled();
  });
  it('valida lote no vacío, sin duplicados y con documentos válidos', async () => {
    for (const persona_ids of [[], [1, 1], [0, 2], ['1', 2]]) {
      const dto = plainToInstance(CreateLoteAsignacionesComisionDto, { ...lote, persona_ids });
      expect((await validate(dto)).map(e => e.property)).toContain('persona_ids');
    }
    const dto = plainToInstance(CreateLoteAsignacionesComisionDto, { ...lote, boletin: 'x'.repeat(51) });
    expect((await validate(dto)).map(e => e.property)).toContain('boletin');
  });
  it('el cargo es opcional y se normaliza al crear', async () => {
    const dto = { persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', numero_orden: '001' };
    expect((await service.crearAsignacion(dto)).cargo).toBeNull();
    expect((await service.crearAsignacion({ ...dto, cargo: '  Secretaria  ' })).cargo).toBe('Secretaria');
  });
  it('permite editar o limpiar el cargo y conserva el valor si se omite', async () => {
    tx.asignaciones_comision.findUnique.mockResolvedValue(registro({ cargo: 'Vocal' }));
    expect((await service.editarAsignacion(10n, { boletin: 'B-002' })).cargo).toBe('Vocal');
    expect((await service.editarAsignacion(10n, { cargo: ' Presidente ' })).cargo).toBe('Presidente');
    expect((await service.editarAsignacion(10n, { cargo: null })).cargo).toBeNull();
    expect((await service.editarAsignacion(10n, { cargo: '   ' })).cargo).toBeNull();
  });
  it('rechaza cargos demasiado largos o de tipo incorrecto', async () => {
    for (const cargo of ['x'.repeat(201), 123]) {
      const dto = plainToInstance(CreateAsignacionComisionDto, { persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', numero_orden: '001', cargo });
      expect((await validate(dto)).map(e => e.property)).toContain('cargo');
    }
  });
  it('valida el documento final combinado al editar', async () => {
    await expect(service.editarAsignacion(10n, { numero_orden: null })).rejects.toThrow(BadRequestException);
    const result = await service.editarAsignacion(10n, { numero_orden: null, boletin: 'B-002' });
    expect(result.numero_orden).toBeNull(); expect(result.boletin).toBe('B-002');
  });
  it('valida las fechas contra el estado final de una edición parcial', async () => {
    tx.asignaciones_comision.findUnique.mockResolvedValue(registro({ fecha_fin: new Date('2026-02-01') }));
    await expect(service.editarAsignacion(10n, { fecha_inicio: '2026-03-01' })).rejects.toThrow(BadRequestException);
  });
  it('rechaza altas y reaperturas en comisiones inactivas', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 2n, vigente: false }]);
    await expect(service.crearAsignacion({ persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', numero_orden: '001' })).rejects.toThrow(ConflictException);
    await expect(service.editarAsignacion(10n, { fecha_fin: null })).rejects.toThrow(ConflictException);
  });
  it('impide inactivar una comisión con pertenencias abiertas', async () => {
    tx.asignaciones_comision.count.mockResolvedValue(1);
    await expect(service.editar(2n, { vigente: false })).rejects.toThrow(ConflictException);
    expect(tx.comisiones.update).not.toHaveBeenCalled();
  });
  it('valida ambos documentos y fechas reales aunque uno sea correcto', async () => {
    const dto = plainToInstance(CreateAsignacionComisionDto, { persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-30', numero_orden: '001', boletin: 'x'.repeat(51) });
    const errors = await validate(dto);
    expect(errors.map(e => e.property)).toEqual(expect.arrayContaining(['fecha_inicio', 'boletin']));
  });

  describe('importadas del Access', () => {
    const importada = (periodoFin: Date | null, changes = {}) => registro({
      importada: true, fecha_inicio: null, numero_orden: null, texto_original: 'COMISIONES: DINACIA',
      relacion_laboral_id: 5n, relaciones_laborales: { fecha_inicio: new Date('2005-03-01'), fecha_fin: periodoFin }, ...changes,
    });
    // El update devuelve la misma asignación con los cambios, no un registro nuevo.
    const conUpdateSobre = (original: ReturnType<typeof registro>) => {
      tx.relaciones_laborales.findUnique.mockResolvedValue(original.relaciones_laborales);
      tx.asignaciones_comision.findUnique.mockResolvedValue(original);
      tx.asignaciones_comision.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...original, ...data }));
    };
    it('no queda abierta si su período ya cerró, aunque no tenga fecha de fin', async () => {
      conUpdateSobre(importada(new Date('2010-06-30')));
      const a = await service.editarAsignacion(10n, { cargo: 'Mozo' });
      expect(a).toEqual(expect.objectContaining({ activo: false, importada: true, fecha_inicio: null, periodo: { fecha_inicio: '2005-03-01', fecha_fin: '2010-06-30' } }));
    });
    it('sigue abierta mientras su período siga abierto', async () => {
      conUpdateSobre(importada(null));
      expect((await service.editarAsignacion(10n, { cargo: null })).activo).toBe(true);
    });
    it('se puede editar sin fecha ni documento, y completarlos después', async () => {
      conUpdateSobre(importada(null));
      await expect(service.editarAsignacion(10n, { cargo: 'Mozo' })).resolves.toBeDefined();
      const completa = await service.editarAsignacion(10n, { fecha_inicio: '2024-03-01', numero_orden: '7682' });
      expect(completa).toEqual(expect.objectContaining({ fecha_inicio: '2024-03-01', numero_orden: '7682', importada: true }));
    });
    it('una asignación cargada en la app sigue exigiendo fecha y documento', async () => {
      tx.asignaciones_comision.findUnique.mockResolvedValue(registro({ fecha_inicio: null }));
      await expect(service.editarAsignacion(10n, { cargo: 'Vocal' })).rejects.toThrow(BadRequestException);
    });
    it('no deja abrir otra pertenencia si una importada sigue abierta por su período', async () => {
      tx.asignaciones_comision.findMany.mockResolvedValue([importada(null)]);
      await expect(service.crearAsignacion({ persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', numero_orden: '001' })).rejects.toThrow(ConflictException);
      expect(tx.asignaciones_comision.create).not.toHaveBeenCalled();
    });
  });
});

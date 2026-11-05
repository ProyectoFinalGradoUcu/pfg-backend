import { BadRequestException, ConflictException } from '@nestjs/common';
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
  personas: { id: 1n, cedula: '123', primer_nombre: 'Ana', primer_apellido: 'Pérez', relaciones_laborales: [{ tipo_funcionario: 'oficial', fecha_fin: null }] },
  comisiones: { id: 2n, denominacion: 'Evaluación', vigente: true },
  ...changes,
});

describe('ComisionesService', () => {
  let service: ComisionesService;
  let tx: any;
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 2n, vigente: true }]),
      personas: { findUnique: jest.fn().mockResolvedValue({ id: 1n }), findMany: jest.fn().mockResolvedValue([{ id: 1n }, { id: 2n }]) },
      comisiones: { update: jest.fn() },
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
  it('rechaza documentos en blanco', async () => {
    await expect(service.crearAsignacion({ persona_id: 1, comision_id: 2, fecha_inicio: '2026-02-01', boletin: '  ' })).rejects.toThrow(BadRequestException);
  });
  const lote = { persona_ids: [1, 2], comision_id: 2, fecha_inicio: '2026-02-01', numero_orden: '001', boletin: 'B-001' };
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
});

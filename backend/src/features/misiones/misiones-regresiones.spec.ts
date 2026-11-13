import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MisionesService } from './misiones.service';
import { validarParticipantes } from './validaciones-misiones';

describe('Misiones: regresiones QA', () => {
  let tx: any;
  let service: MisionesService;
  const conv = { id: 10n, mision_id: 1n, numero_orden: 'O-1', boletin: null, fecha_salida: new Date('2026-01-01'), fecha_llegada: new Date('2026-06-30') };
  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn(), $transaction: jest.fn().mockImplementation(fn => Array.isArray(fn) ? Promise.all(fn) : fn(tx)),
      misiones: { findUnique: jest.fn().mockResolvedValue({ id: 1n, nombre_mision: 'Congo' }), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1n, ...data })) },
      convocatorias: { findFirst: jest.fn().mockResolvedValue(conv), create: jest.fn().mockResolvedValue(conv), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...conv, ...data })) },
      personas: { findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id.in.map(id => ({ id })))) },
      funcionarios_convocatorias: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn(), count: jest.fn().mockResolvedValue(250) },
    };
    service = new MisionesService(tx);
  });
  it('guarda orden y boletín y permite limpiarlos explícitamente', async () => {
    await service.editarMision(1, { numero_orden: 'ORD-NUEVA', boletin: null });
    expect(tx.misiones.update.mock.calls[0][0].data).toMatchObject({ numero_orden: 'ORD-NUEVA', boletin: null });
  });
  it('rechaza nombres vacíos al editar', async () => {
    await expect(service.editarMision(1, { nombre_mision: '  ' })).rejects.toThrow(BadRequestException);
  });
  it('null borra fechas; los campos omitidos se conservan', async () => {
    const res = await service.editarConvocatoria(1, 10, { fecha_llegada: null });
    expect(res.fecha_llegada).toBeNull();
    expect(res.fecha_salida).toBe('2026-01-01');
    expect(tx.convocatorias.update.mock.calls[0][0].data).not.toHaveProperty('fecha_salida');
  });
  it('valida fechas contra el estado final en una edición parcial', async () => {
    await expect(service.editarConvocatoria(1, 10, { fecha_salida: '2026-07-01' })).rejects.toThrow(BadRequestException);
    expect(tx.convocatorias.update).not.toHaveBeenCalled();
  });
  it('persona inexistente devuelve 404 antes de crear convocatoria o participantes', async () => {
    tx.personas.findMany.mockResolvedValue([]);
    await expect(service.crearConvocatoria(1, { numero_orden: 'O', persona_ids: [999] })).rejects.toThrow(NotFoundException);
    expect(tx.convocatorias.create).not.toHaveBeenCalled();
  });
  it('rechaza solapamientos al agregar personas', async () => {
    tx.funcionarios_convocatorias.findFirst.mockResolvedValue({ persona_id: 3n, convocatoria_id: 20n });
    await expect(service.agregarFuncionarios(1, 10, { funcionarios: [{ persona_id: 3, numero_orden: 'O' }] })).rejects.toThrow(ConflictException);
    expect(tx.funcionarios_convocatorias.createMany).not.toHaveBeenCalled();
  });
  it('editar fechas revisa a todos los participantes y excluye la propia convocatoria', async () => {
    tx.funcionarios_convocatorias.findMany.mockResolvedValue([{ persona_id: 3n }]);
    tx.funcionarios_convocatorias.findFirst.mockResolvedValue({ persona_id: 3n, convocatoria_id: 20n });
    await expect(service.editarConvocatoria(1, 10, { fecha_llegada: null })).rejects.toThrow(ConflictException);
    expect(tx.funcionarios_convocatorias.findFirst.mock.calls[0][0].where.convocatoria_id).toEqual({ not: 10n });
    expect(tx.convocatorias.update).not.toHaveBeenCalled();
  });
  it('el control usa límites inclusivos para impedir compartir el día de regreso', async () => {
    await validarParticipantes(tx, [3n], conv, 10n);
    expect(tx.funcionarios_convocatorias.findFirst.mock.calls[0][0].where.convocatorias.AND).toEqual([
      { OR: [{ fecha_salida: null }, { fecha_salida: { lte: conv.fecha_llegada } }] },
      { OR: [{ fecha_llegada: null }, { fecha_llegada: { gte: conv.fecha_salida } }] },
    ]);
  });
  it('pagina más allá de 200 y combina filtros antes de contar y paginar', async () => {
    const res = await service.listarPersonalEnMision({ page: 22, pageSize: 10, query: 'Ana', estado: 'activa', documento: 'O', mision_ids: [1] });
    expect(res.total).toBe(250);
    expect(tx.funcionarios_convocatorias.findMany.mock.calls[0][0]).toMatchObject({ skip: 210, take: 10, where: { convocatorias: { mision_id: { in: [1n] } } } });
    expect(tx.funcionarios_convocatorias.count.mock.calls[0][0].where).toEqual(tx.funcionarios_convocatorias.findMany.mock.calls[0][0].where);
  });
});

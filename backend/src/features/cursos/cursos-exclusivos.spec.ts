import { ConflictException, NotFoundException } from '@nestjs/common';
import { CursosService } from './cursos.service';
import { MisionesService } from '../misiones/misiones.service';

describe('Fixes exclusivos SCRUM-194, SCRUM-195 y SCRUM-207', () => {
  let tx: any;
  const dto = { persona_ids: [10], numero_orden: 'O-1', fecha_inicio: '2026-01-01', fecha_fin: '2026-06-30' };
  beforeEach(() => {
    tx = {
      cursos: { findUnique: jest.fn().mockResolvedValue({ id: 1n }) },
      personas: { findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id.in.map(id => ({ id })))) },
      funcionarios_cursos: {
        findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 1n }),
        upsert: jest.fn().mockResolvedValue({ id: 1n }), update: jest.fn(),
      },
      modulos_curso: { findFirst: jest.fn().mockResolvedValue({ id: 2n }) },
      funcionarios_modulos_curso: { upsert: jest.fn() },
      misiones: { findUnique: jest.fn().mockResolvedValue({ id: 1n }) },
      convocatorias: { create: jest.fn() },
      $queryRaw: jest.fn(), $transaction: jest.fn().mockImplementation(fn => fn(tx)),
    };
  });
  it.each([false, true])('rechaza inscripción existente sin sobrescribirla (baja=%s)', async baja => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue({ id: 1n, dado_de_baja: baja });
    await expect(new CursosService(tx).crearDesignacion(1, dto)).rejects.toThrow(ConflictException);
    expect(tx.funcionarios_cursos.create).not.toHaveBeenCalled();
    expect(tx.funcionarios_cursos.update).not.toHaveBeenCalled();
  });
  it('deduplica personas y cuenta una inscripción real', async () => {
    const res = await new CursosService(tx).crearDesignacion(1, { ...dto, persona_ids: [10, 10] });
    expect(res.personas_designadas).toBe(1);
    expect(tx.funcionarios_cursos.create).toHaveBeenCalledTimes(1);
  });
  it('rechaza calificar una baja', async () => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue({ id: 1n, persona_id: 10n, dado_de_baja: true });
    await expect(new CursosService(tx).actualizarDesignacion(1, 1, { aprobado: true })).rejects.toThrow(ConflictException);
    expect(tx.funcionarios_cursos.update).not.toHaveBeenCalled();
  });
  it('rechaza completar un módulo de baja', async () => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue({ id: 1n, dado_de_baja: true });
    await expect(new CursosService(tx).marcarCompletacion(1, 2, { persona_id: 10, completado: true })).rejects.toThrow(ConflictException);
    expect(tx.funcionarios_modulos_curso.upsert).not.toHaveBeenCalled();
  });
  it('persona inexistente en cursos devuelve 404 antes de insertar', async () => {
    tx.personas.findMany.mockResolvedValue([]);
    await expect(new CursosService(tx).crearDesignacion(1, dto)).rejects.toThrow(NotFoundException);
    expect(tx.funcionarios_cursos.create).not.toHaveBeenCalled();
  });
  it('persona inexistente en misiones devuelve 404 antes de crear convocatoria', async () => {
    tx.personas.findMany.mockResolvedValue([]);
    await expect(new MisionesService(tx).crearConvocatoria(1, { numero_orden: 'O', persona_ids: [999] })).rejects.toThrow(NotFoundException);
    expect(tx.convocatorias.create).not.toHaveBeenCalled();
  });
});

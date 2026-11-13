import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CursosService } from './cursos.service';
import { CreateDesignacionDto } from './dto/create-designacion.dto';
import { UpdateCursoDto } from './dto/update-curso.dto';
import { crearCurso } from './crear-curso';

describe('Cursos — regresiones QA', () => {
  let tx: any;
  let service: CursosService;
  const dto = { persona_ids: [10], fecha_inicio: '2026-01-01', fecha_fin: '2026-06-30', numero_orden: 'ORD-1' };
  const inscripcion = { id: 1n, persona_id: 10n, curso_id: 1n, dado_de_baja: false, aprobado: true, calificacion: '8', observacion_calificacion: 'Anterior' };
  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 1n }]),
      cursos: { findUnique: jest.fn().mockResolvedValue({ id: 1n, nombre_curso: 'Aviación' }), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 1n }), update: jest.fn() },
      personas: { findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id.in.map((id: bigint) => ({ id })))) },
      modulos_curso: { findFirst: jest.fn().mockResolvedValue({ id: 2n }), count: jest.fn().mockResolvedValue(1) },
      funcionarios_cursos: {
        findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(inscripcion), upsert: jest.fn().mockResolvedValue(inscripcion),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...inscripcion, ...data })),
      },
      funcionarios_modulos_curso: { upsert: jest.fn().mockImplementation(({ update }) => Promise.resolve({ id: 2n, funcionario_curso_id: 1n, modulo_id: 2n, calificacion: '8', ...update })) },
      $transaction: jest.fn().mockImplementation(fn => fn(tx)),
    };
    service = new CursosService(tx);
  });

  it.each([false, true])('rechaza redesignar una inscripción existente (baja=%s) sin pisar el historial', async baja => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue({ ...inscripcion, dado_de_baja: baja });
    await expect(service.crearDesignacion(1, dto)).rejects.toThrow(ConflictException);
    expect(tx.funcionarios_cursos.create).not.toHaveBeenCalled();
    expect(tx.funcionarios_cursos.update).not.toHaveBeenCalled();
    expect(tx.funcionarios_cursos.upsert).not.toHaveBeenCalled();
  });
  it('deduplica personas y módulos y cuenta solo designaciones reales', async () => {
    const res = await service.crearDesignacion(1, { ...dto, persona_ids: [10, 10], modulo_ids: [2, 2] });
    expect(res.personas_designadas).toBe(1);
    expect(res.modulos_designados).toBe(1);
    expect(tx.funcionarios_cursos.create).toHaveBeenCalledTimes(1);
  });
  it('rechaza todo el lote si una persona no existe', async () => {
    tx.personas.findMany.mockResolvedValue([{ id: 10n }]);
    await expect(service.crearDesignacion(1, { ...dto, persona_ids: [10, 999] })).rejects.toThrow(NotFoundException);
    expect(tx.funcionarios_cursos.create).not.toHaveBeenCalled();
  });
  it('rechaza una persona fuera de alcance antes de escribir', async () => {
    tx.cursos.findFirst.mockResolvedValue({ id: 1n });
    tx.personas.findMany.mockResolvedValue([]);
    await expect(service.crearDesignacion(1, dto, { tipo: 'unidad', subUnidadIds: ['7'], comandoIds: ['1'] })).rejects.toThrow(NotFoundException);
    expect(tx.funcionarios_cursos.create).not.toHaveBeenCalled();
    expect(tx.personas.findMany.mock.calls[0][0].where.relaciones_laborales.some.sub_unidad_id).toEqual({ in: [7n] });
  });
  it('rechaza fechas invertidas antes de escribir', async () => {
    await expect(service.crearDesignacion(1, { ...dto, fecha_fin: '2025-12-31' })).rejects.toThrow(BadRequestException);
    expect(tx.$transaction).not.toHaveBeenCalled();
  });
  it('calificar un curso sin nota u observación conserva los valores anteriores', async () => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue(inscripcion);
    const res = await service.actualizarDesignacion(1, 1, { aprobado: false });
    expect(res).toMatchObject({ aprobado: false, calificacion: 8, observacion: 'Anterior' });
    expect(tx.funcionarios_cursos.update.mock.calls[0][0].data).toEqual({ aprobado: false });
  });
  it('null explícito permite limpiar nota y observación', async () => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue(inscripcion);
    const res = await service.actualizarDesignacion(1, 1, { aprobado: true, calificacion: null, observacion: null });
    expect(res).toMatchObject({ calificacion: null, observacion: null });
  });
  it('rechaza calificar un curso dado de baja', async () => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue({ ...inscripcion, dado_de_baja: true });
    await expect(service.actualizarDesignacion(1, 1, { aprobado: true })).rejects.toThrow(ConflictException);
    expect(tx.funcionarios_cursos.update).not.toHaveBeenCalled();
  });
  it('completar un módulo preserva todos los campos omitidos', async () => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue(inscripcion);
    await service.marcarCompletacion(1, 2, { persona_id: 10, aprobado: false });
    expect(tx.funcionarios_modulos_curso.upsert.mock.calls[0][0].update).toEqual({ aprobado: false });
  });
  it('rechaza módulos de una inscripción dada de baja, incluso tras volver a leerla bajo bloqueo', async () => {
    tx.funcionarios_cursos.findFirst.mockResolvedValue({ ...inscripcion, dado_de_baja: true });
    await expect(service.marcarCompletacion(1, 2, { persona_id: 10, completado: true })).rejects.toThrow(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.funcionarios_modulos_curso.upsert).not.toHaveBeenCalled();
  });
  it('persona inexistente al completar devuelve 404, sin crear inscripción', async () => {
    tx.personas.findMany.mockResolvedValue([]);
    await expect(service.marcarCompletacion(1, 2, { persona_id: 999, completado: true })).rejects.toThrow(NotFoundException);
    expect(tx.funcionarios_cursos.upsert).not.toHaveBeenCalled();
  });
  it('el catálogo comprueba nombres sin distinguir mayúsculas y recorta espacios', async () => {
    await crearCurso(tx, { nombre_curso: '  Aviación  ', institucion: 'EMA' });
    expect(tx.cursos.findFirst).toHaveBeenCalledWith({ where: { nombre_curso: { equals: 'Aviación', mode: 'insensitive' } } });
    expect(tx.cursos.create.mock.calls[0][0].data.nombre_curso).toBe('Aviación');
  });
  it.each(['', '   ', null])('rechaza nombre vacío al editar (%s)', async nombre => {
    const errors = await validate(plainToInstance(UpdateCursoDto, { nombre_curso: nombre }));
    expect(errors.some(e => e.property === 'nombre_curso')).toBe(true);
  });
  it.each([
    { boletin: 'B-1', numero_orden: 'x'.repeat(51) },
    { numero_orden: 'O-1', boletin: 123 },
    { numero_orden: '  ', boletin: '  ' },
    { persona_ids: [0] },
  ])('valida todos los documentos e IDs: %j', async cambios => {
    expect((await validate(plainToInstance(CreateDesignacionDto, { ...dto, ...cambios }))).length).toBeGreaterThan(0);
  });
});

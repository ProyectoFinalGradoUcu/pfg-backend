import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AlcanceGuard } from '../../lib/alcance/alcance.guard';
import { HistorialCursosController } from './historial-cursos.controller';

describe('Permisos de registro de historial de cursos (SCRUM-166)', () => {
  const guard = new AlcanceGuard(new Reflector());

  function contexto(permisos: string[], unidades = [{ id: '7', comando: { id: '1' } }]) {
    const request = { user: { permisos, unidades }, alcance: undefined };
    const context = {
      getHandler: () => HistorialCursosController.prototype.create,
      getClass: () => HistorialCursosController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('deniega al usuario que solo puede ver personas y cursos', () => {
    const { context } = contexto(['personas.ver.unidad', 'cursos.ver.unidad']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('resuelve alcance global para cursos.gestionar', () => {
    const { context, request } = contexto(['cursos.gestionar']);
    expect(guard.canActivate(context)).toBe(true);
    expect(request.alcance).toEqual({ tipo: 'global' });
  });

  it('resuelve las unidades con cursos.gestionar.unidad', () => {
    const { context, request } = contexto(['cursos.gestionar.unidad']);
    expect(guard.canActivate(context)).toBe(true);
    expect(request.alcance).toEqual({ tipo: 'unidad', subUnidadIds: ['7'], comandoIds: ['1'] });
  });

  it('deniega gestión por unidad sin unidades asignadas', () => {
    const { context } = contexto(['cursos.gestionar.unidad'], []);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AlcanceGuard } from '../../lib/alcance/alcance.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ComisionesController } from './comisiones.controller';
import { ComisionesService } from './comisiones.service';
import { wherePersonasPorAlcance } from '../../lib/alcance/alcance.where';

describe('Comisiones: alcance por unidad', () => {
  const alcance = { tipo: 'unidad' as const, unidadIds: ['7', '8'] };
  const persona = wherePersonasPorAlcance(alcance);

  it('acota listado, estadísticas y cantidad de integrantes al alcance', async () => {
    const prisma: any = {
      asignaciones_comision: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      comisiones: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: (p: Promise<unknown>[]) => Promise.all(p),
    };
    const service = new ComisionesService(prisma);
    await service.listarAsignaciones({ activo: true }, alcance);
    expect(prisma.asignaciones_comision.findMany.mock.calls[0][0].where.personas).toEqual(persona);
    expect(prisma.asignaciones_comision.count.mock.calls.every(([q]: any) => JSON.stringify(q.where.personas, (_, v) => typeof v === 'bigint' ? String(v) : v) === JSON.stringify(persona, (_, v) => typeof v === 'bigint' ? String(v) : v))).toBe(true);
    expect(prisma.comisiones.count.mock.calls[0][0].where.asignaciones_comision.some.personas).toEqual(persona);
    await service.listar({}, alcance);
    expect(prisma.comisiones.findMany.mock.calls[0][0].include._count.select.asignaciones_comision.where.personas).toEqual(persona);
  });

  it('detalle fuera de alcance devuelve 404 y filtra antes de leer datos personales', async () => {
    const prisma: any = { asignaciones_comision: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(new ComisionesService(prisma).obtenerAsignacion(10n, alcance)).rejects.toThrow(NotFoundException);
    expect(prisma.asignaciones_comision.findFirst.mock.calls[0][0].where).toEqual({ id: 10n, personas: persona });
  });

  function contexto(handler: string, permisos: string[]) {
    const request: any = { user: { permisos, unidades: [{ id: '7' }] } };
    return { request, context: {
      getHandler: () => ComisionesController.prototype[handler], getClass: () => ComisionesController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext };
  }

  it.each(['asignaciones', 'asignacion', 'listar', 'funcionarios', 'obtener'])('lectura %s acepta permiso de unidad', handler => {
    const { request, context } = contexto(handler, ['comisiones.ver.unidad']);
    expect(new AlcanceGuard(new Reflector()).canActivate(context)).toBe(true);
    expect(request.alcance).toEqual({ tipo: 'unidad', unidadIds: ['7'] });
  });

  it.each(['crearAsignacion', 'crearLote', 'editarAsignacion', 'eliminarAsignacion'])('gestión %s exige permiso de escritura y resuelve unidad', handler => {
    const guard = new AlcanceGuard(new Reflector());
    expect(() => guard.canActivate(contexto(handler, ['comisiones.ver.unidad']).context)).toThrow(ForbiddenException);
    expect(guard.canActivate(contexto(handler, ['comisiones.gestionar.unidad']).context)).toBe(true);
  });

  it.each(['crear', 'editar'])('el catálogo compartido (%s) requiere gestión global', handler => {
    const guard = new PermissionsGuard(new Reflector());
    expect(() => guard.canActivate(contexto(handler, ['comisiones.gestionar.unidad']).context)).toThrow(ForbiddenException);
    expect(guard.canActivate(contexto(handler, ['comisiones.gestionar']).context)).toBe(true);
  });
});

import { Logger } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AuditoriaInterceptor, tipoDeCambio } from './auditoria.interceptor';
import { AuditoriaFotos, type FotoAuditoria } from './auditoria-fotos';
import type { AuditarOptions } from './decorators/auditar.decorator';

describe('AuditoriaInterceptor', () => {
  let auditoria: { registrar: jest.Mock };
  let nombres: { resolver: jest.Mock };
  let fotos: AuditoriaFotos;
  let cargador: jest.Mock;

  const contexto = (method: string, params: Record<string, string>, body: unknown = {}) => {
    const req = { method, params, body, headers: {}, ip: '10.0.0.1', user: { id: '1' } };
    return { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => null, getClass: () => null } as any;
  };

  const ejecutar = async (
    opciones: AuditarOptions,
    method: string,
    params: Record<string, string>,
    body: unknown = {},
    handler: () => unknown = () => ({ ok: true }),
  ) => {
    const reflector = { getAllAndOverride: () => opciones } as any;
    const interceptor = new AuditoriaInterceptor(reflector, auditoria as any, fotos, nombres as any);
    const next = { handle: jest.fn(() => of(handler())) };
    await lastValueFrom(interceptor.intercept(contexto(method, params, body), next));
    // El registro no se espera, hay que vaciar la cola
    for (let i = 0; i < 20 && auditoria.registrar.mock.calls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    return next;
  };

  const detalle = () => auditoria.registrar.mock.calls[0][0].detalle;
  const foto = (campos: Record<string, unknown>, nombre = 'Sgto. Juan Pérez'): FotoAuditoria => ({ nombre, campos });

  beforeEach(() => {
    auditoria = { registrar: jest.fn().mockResolvedValue(undefined) };
    nombres = { resolver: jest.fn().mockResolvedValue([{ nombres: {}, entidadNombre: null }]) };
    fotos = new AuditoriaFotos({} as any);
    cargador = jest.fn();
    fotos.registrar('persona', cargador);
  });

  it('en una edición guarda solo los campos que cambiaron', async () => {
    cargador
      .mockResolvedValueOnce(foto({ telefono: '099', grado: 'Cabo', sub_unidad: 'B.A.I.' }))
      .mockResolvedValueOnce(foto({ telefono: '098', grado: 'Sargento', sub_unidad: 'B.A.I.' }));

    await ejecutar({ contexto: 'Personas', entidad: 'Persona', foto: 'persona' }, 'PATCH', { id: '5' }, {
      telefono: '098',
      grado_id: 4,
      sub_unidad_id: 1,
    });

    expect(cargador).toHaveBeenCalledTimes(2);
    expect(detalle().cambios).toEqual([
      { campo: 'telefono', anterior: '099', nuevo: '098' },
      { campo: 'grado', anterior: 'Cabo', nuevo: 'Sargento' },
    ]);
    expect(detalle().descripcion).toBe('Modificó la persona Sgto. Juan Pérez');
  });

  it('la foto anterior se saca antes del handler', async () => {
    const orden: string[] = [];
    cargador.mockImplementation(() => {
      orden.push('foto');
      return Promise.resolve(foto({ telefono: '099' }));
    });

    await ejecutar({ contexto: 'Personas', entidad: 'Persona', foto: 'persona' }, 'PATCH', { id: '5' }, {}, () => {
      orden.push('handler');
      return {};
    });

    expect(orden).toEqual(['foto', 'handler', 'foto']);
  });

  it('en una eliminación guarda la foto de lo borrado', async () => {
    cargador.mockResolvedValueOnce(foto({ cedula: '12345678', grado: 'Sargento' }));

    await ejecutar({ contexto: 'Subalternos', entidad: 'Subalterno', foto: 'persona' }, 'DELETE', { id: '5' });

    expect(detalle().anterior).toEqual({ cedula: '12345678', grado: 'Sargento' });
    expect(detalle().descripcion).toBe('Eliminó el subalterno Sgto. Juan Pérez');
    expect(detalle().cambios).toBeUndefined();
  });

  it('si la foto falla se audita igual', async () => {
    cargador.mockRejectedValue(new Error('se cayó la base'));

    await ejecutar({ contexto: 'Personas', entidad: 'Persona', foto: 'persona' }, 'DELETE', { id: '5' });

    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    expect(detalle().params).toEqual({ id: '5' });
    expect(detalle().anterior).toBeUndefined();
    expect(detalle().descripcion).toBe('Eliminó la persona');
  });

  it('si los nombres fallan se audita igual sin descripción', async () => {
    nombres.resolver.mockRejectedValue(new Error('caída'));

    await ejecutar({ contexto: 'Roles', entidad: 'Rol' }, 'PATCH', { id: '4' }, { nombre: 'Nuevo' });

    expect(auditoria.registrar).toHaveBeenCalledTimes(1);
    expect(detalle()).toEqual({ params: { id: '4' }, body: { nombre: 'Nuevo' } });
  });

  it('sin cambios reales no guarda cambios', async () => {
    cargador.mockResolvedValue(foto({ telefono: '099' }));

    await ejecutar({ contexto: 'Personas', entidad: 'Persona', foto: 'persona' }, 'PATCH', { id: '5' }, { telefono: '099' });

    expect(detalle().cambios).toBeUndefined();
  });

  it('el id de la foto puede salir de otro param', async () => {
    cargador.mockResolvedValue(foto({ familiar: 'Ana Gómez' }, 'Ana Gómez'));

    await ejecutar(
      { contexto: 'Personas', entidad: 'Familiar', accion: 'DESASIGNAR', foto: 'persona', idParam: 'familiarId' },
      'DELETE',
      { id: '5', familiarId: '6' },
    );

    expect(cargador.mock.calls[0][0]).toBe(6n);
    expect(detalle().anterior).toEqual({ familiar: 'Ana Gómez' });
    expect(detalle().descripcion).toBe('Desvinculó a Ana Gómez como familiar');
  });

  it('las bajas resuelven los nombres de los params antes del handler', async () => {
    nombres.resolver.mockResolvedValueOnce([{ nombres: { 'permisoId:3': 'Ver personas' }, entidadNombre: 'Admin' }]);

    await ejecutar({ contexto: 'Roles', accion: 'DESASIGNAR', entidad: 'Rol' }, 'DELETE', { id: '4', permisoId: '3' });

    expect(detalle().descripcion).toBe('Quitó el permiso Ver personas del rol Admin');
  });

  it('si falla el registro la operación sigue y solo se loguea', async () => {
    auditoria.registrar.mockRejectedValue(new Error('sin base'));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await ejecutar({ contexto: 'Roles', entidad: 'Rol' }, 'POST', {}, {}, () => ({ id: 9 }));
    await new Promise((r) => setImmediate(r));

    expect(error).toHaveBeenCalledWith(expect.stringContaining('sin base'));
    error.mockRestore();
  });

  it('no audita lecturas', async () => {
    const next = await ejecutar({ contexto: 'Roles', entidad: 'Rol', foto: 'persona' }, 'GET', { id: '4' });

    expect(next.handle).toHaveBeenCalled();
    expect(cargador).not.toHaveBeenCalled();
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  it('desactivar guarda el cambio de activo', async () => {
    cargador.mockResolvedValueOnce(foto({ nombre: 'Cabo a Sgto.', activo: true })).mockResolvedValueOnce(foto({ nombre: 'Cabo a Sgto.', activo: false }));

    await ejecutar(
      { contexto: 'Reglas de ascenso', entidad: 'Regla de ascenso', accion: 'regla_ascenso.desactivar', foto: 'persona' },
      'POST',
      { id: '3' },
    );

    expect(detalle().cambios).toEqual([{ campo: 'activo', anterior: true, nuevo: false }]);
    expect(detalle().anterior).toBeUndefined();
  });

  it('en una edición con foto no guarda la respuesta', async () => {
    cargador.mockResolvedValueOnce(foto({ notas: null })).mockResolvedValueOnce(foto({ notas: 'Nueva' }));

    await ejecutar(
      { contexto: 'Reglas de ascenso', entidad: 'Regla de ascenso', incluirRespuesta: true, foto: 'persona' },
      'PATCH',
      { id: '3' },
      { notas: 'Nueva' },
      () => ({ id: 4, versiones_anteriores: [{ id: 3 }], page: 1 }),
    );

    expect(detalle().resultado).toBeUndefined();
    expect(detalle().cambios).toEqual([{ campo: 'notas', anterior: null, nuevo: 'Nueva' }]);
  });

  it('en una baja con foto no guarda la respuesta y la foto va sin vacíos', async () => {
    cargador.mockResolvedValueOnce(foto({ cargo: 'Vocal', boletin: null, funcionarios: [], numero_orden: '' }));

    await ejecutar(
      { contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true, foto: 'persona' },
      'DELETE',
      { id: '7' },
      {},
      () => ({ eliminado: true }),
    );

    expect(detalle().resultado).toBeUndefined();
    expect(detalle().anterior).toEqual({ cargo: 'Vocal' });
  });

  it('en un alta con foto guarda la foto legible como resultado', async () => {
    cargador.mockResolvedValueOnce(foto({ persona: 'Sgto. Juan Pérez', cargo: 'Vocal', boletin: null }));

    await ejecutar(
      { contexto: 'Comisiones', entidad: 'Asignación de comisión', incluirRespuesta: true, foto: 'persona' },
      'POST',
      {},
      { persona_id: 5 },
      () => ({ id: 7, categoria: 'vigente', texto_original: 'x', importada: false }),
    );

    expect(cargador.mock.calls[0][0]).toBe(7n);
    expect(detalle().resultado).toEqual({ persona: 'Sgto. Juan Pérez', cargo: 'Vocal' });
  });

  it('al vincular un familiar la foto sale del id de la respuesta', async () => {
    cargador.mockResolvedValueOnce(foto({ familiar: 'Sgto. Ana Gómez', tipo_relacion: 'Hermana' }, 'Sgto. Ana Gómez'));
    nombres.resolver.mockResolvedValueOnce([{ nombres: { 'id:5': 'Cbo. Juan Pérez' }, entidadNombre: null }]);

    await ejecutar(
      { contexto: 'Personas', entidad: 'Familiar', accion: 'ASIGNAR', incluirRespuesta: true, foto: 'persona', idParam: 'familiarId' },
      'POST',
      { id: '5' },
      { cedula: '1234', tipo_relacion: 'Hermana' },
      () => ({ id: 6, nombre_completo: 'Ana Gómez', grado: null }),
    );

    expect(cargador.mock.calls[0][0]).toBe(6n);
    expect(detalle().descripcion).toBe('Vinculó a Sgto. Ana Gómez como familiar de Cbo. Juan Pérez');
    expect(detalle().resultado).toEqual({ familiar: 'Sgto. Ana Gómez', tipo_relacion: 'Hermana' });
  });

  it('sin foto la respuesta se guarda como venía', async () => {
    await ejecutar(
      { contexto: 'Derecha', entidad: 'Derecha', accion: 'derecha.reordenar', incluirRespuesta: true },
      'POST',
      {},
      {},
      () => ({ afectados: 2 }),
    );

    expect(detalle().resultado).toEqual({ afectados: 2 });
  });

  it('borrar un civil desde subalternos dice la persona', async () => {
    cargador.mockResolvedValueOnce(foto({ cedula: '1234', es_civil: true }, 'Ana Gómez'));

    await ejecutar({ contexto: 'Subalternos', entidad: 'Subalterno', foto: 'persona' }, 'DELETE', { id: '5' });

    expect(detalle().descripcion).toBe('Eliminó la persona Ana Gómez');
  });

  it('clasifica anular como baja y desactivar como edición', () => {
    expect(tipoDeCambio('POST', 'retiro.anular')).toBe('baja');
    expect(tipoDeCambio('DELETE', 'reincorporacion.anular')).toBe('baja');
    expect(tipoDeCambio('POST', 'regla_ascenso.desactivar')).toBe('edicion');
    expect(tipoDeCambio('DELETE', 'ELIMINAR')).toBe('baja');
    expect(tipoDeCambio('POST', 'DESASIGNAR')).toBe('baja');
    expect(tipoDeCambio('POST', 'ACTUALIZAR')).toBe('edicion');
    expect(tipoDeCambio('PUT', 'ASIGNAR')).toBe('otro');
    expect(tipoDeCambio('POST', 'CREAR')).toBe('alta');
  });
});

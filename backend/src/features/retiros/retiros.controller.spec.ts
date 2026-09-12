import { PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { RetirosController } from './retiros.controller';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

/** Handlers en el orden en que están declarados en la clase. */
const handlersEnOrden = () =>
  Object.getOwnPropertyNames(RetirosController.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const fn = (RetirosController.prototype as any)[name];
      return {
        name,
        path: Reflect.getMetadata(PATH_METADATA, fn) as string,
        method: Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod,
      };
    })
    .filter((h) => h.path !== undefined);

describe('RetirosController · rutas', () => {
  // Express resuelve en orden de declaración: si ':retiroId' se declarara antes
  // que 'previa', un GET /retiros/previa/12 entraría por el handler del id y
  // ParseIntPipe lo rechazaría con 400.
  it('declara previa antes que la ruta con :retiroId', () => {
    const rutas = handlersEnOrden();

    const idxPrevia = rutas.findIndex((r) => r.path === 'previa/:personaId');
    const idxPorId = rutas.findIndex(
      (r) => r.path === ':retiroId' && r.method === RequestMethod.GET,
    );

    expect(idxPrevia).toBeGreaterThanOrEqual(0);
    expect(idxPorId).toBeGreaterThanOrEqual(0);
    expect(idxPrevia).toBeLessThan(idxPorId);
  });

  it('expone exactamente las seis rutas del módulo', () => {
    const rutas = handlersEnOrden().map((r) => `${RequestMethod[r.method]} ${r.path}`);

    expect(rutas.sort()).toEqual(
      [
        'GET /',
        'GET previa/:personaId',
        'GET :retiroId',
        'POST /',
        'PATCH :retiroId',
        'DELETE :retiroId',
      ].sort(),
    );
  });
});

describe('RetirosController · permisos', () => {
  const permisoDe = (handler: string) =>
    Reflect.getMetadata(PERMISSIONS_KEY, (RetirosController.prototype as any)[handler]);

  it.each([
    ['listar', 'retiros.ver'],
    ['previa', 'retiros.ver'],
    ['obtener', 'retiros.ver'],
    ['registrar', 'retiros.registrar'],
    ['corregir', 'retiros.registrar'],
    ['anular', 'retiros.registrar'],
  ])('%s requiere %s', (handler, permiso) => {
    expect(permisoDe(handler)).toEqual([permiso]);
  });

  it('ningún handler queda sin permiso', () => {
    const sinPermiso = handlersEnOrden().filter((h) => permisoDe(h.name) === undefined);
    expect(sinPermiso).toEqual([]);
  });
});

describe('RetirosController · auditoría', () => {
  it('el controller está marcado con @Auditar', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, RetirosController)).toMatchObject({
      contexto: 'Retiros',
      entidad: 'Retiro',
    });
  });
});

describe('RetirosController · envoltorio service_request', () => {
  // Convencion de la casa: todo body de POST/PATCH/DELETE va dentro de
  // service_request, igual que destinos, misiones, catalogos y subalternos.
  const dataDeBody = (handler: string) => {
    const meta =
      Reflect.getMetadata(ROUTE_ARGS_METADATA, RetirosController, handler) ?? {};
    return Object.entries(meta)
      .filter(([clave]) => clave.startsWith('3:'))
      .map(([, valor]) => (valor as any).data);
  };

  it.each(['registrar', 'corregir', 'anular'])(
    '%s extrae el dto de service_request',
    (handler) => {
      expect(dataDeBody(handler)).toEqual(['service_request']);
    },
  );

  it('ningun handler de escritura toma el body plano', () => {
    const planos = ['registrar', 'corregir', 'anular'].filter((h) =>
      dataDeBody(h).includes(undefined),
    );
    expect(planos).toEqual([]);
  });
});

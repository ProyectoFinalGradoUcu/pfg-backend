import { Test, TestingModule } from '@nestjs/testing';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { DestinosController } from './destinos.controller';
import { DestinosService } from './destinos.service';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

/** Handlers en el orden en que están declarados en la clase. */
const handlersEnOrden = () =>
  Object.getOwnPropertyNames(DestinosController.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const fn = (DestinosController.prototype as any)[name];
      return {
        name,
        path: Reflect.getMetadata(PATH_METADATA, fn) as string,
        method: Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod,
        permisos: Reflect.getMetadata(PERMISSIONS_KEY, fn) as string[] | undefined,
      };
    })
    .filter((h) => h.path !== undefined);

describe('DestinosController · rutas', () => {
  // Express resuelve en orden de declaración: si ':destinoId' se declara antes
  // que 'unidades', un GET /destinos/unidades entra por el handler del id y
  // ParseIntPipe lo rechaza con 400.
  it('declara las rutas de unidades antes que la ruta con :destinoId', () => {
    const rutas = handlersEnOrden();

    const idxUnidades = rutas.findIndex((r) => r.path === 'unidades');
    const idxUnidadFuncionarios = rutas.findIndex(
      (r) => r.path === 'unidades/:unidadId/funcionarios',
    );
    const idxPorId = rutas.findIndex(
      (r) => r.path === ':destinoId' && r.method === RequestMethod.GET,
    );

    expect(idxUnidades).toBeGreaterThanOrEqual(0);
    expect(idxUnidadFuncionarios).toBeGreaterThanOrEqual(0);
    expect(idxPorId).toBeGreaterThanOrEqual(0);

    expect(idxUnidades).toBeLessThan(idxPorId);
    expect(idxUnidadFuncionarios).toBeLessThan(idxPorId);
  });

  it('expone exactamente las siete rutas del módulo', () => {
    const rutas = handlersEnOrden().map((r) => `${RequestMethod[r.method]} ${r.path}`);

    expect(rutas.sort()).toEqual(
      [
        'GET unidades',
        'GET unidades/:unidadId/funcionarios',
        'GET /',
        'GET :destinoId',
        'POST /',
        'PATCH :destinoId',
        'DELETE :destinoId',
      ].sort(),
    );
  });
});

describe('DestinosController · permisos', () => {
  const permisoDe = (handler: string) =>
    Reflect.getMetadata(PERMISSIONS_KEY, (DestinosController.prototype as any)[handler]);

  it.each([
    ['listarDestinos', 'destinos.ver'],
    ['obtenerDestino', 'destinos.ver'],
    ['listarUnidades', 'destinos.ver'],
    ['listarFuncionariosUnidad', 'destinos.ver'],
  ])('%s exige %s', (handler, permiso) => {
    expect(permisoDe(handler)).toEqual([permiso]);
  });

  it.each([
    ['crearDestino', 'destinos.gestionar'],
    ['editarDestino', 'destinos.gestionar'],
    ['eliminarDestino', 'destinos.gestionar'],
  ])('%s exige %s', (handler, permiso) => {
    expect(permisoDe(handler)).toEqual([permiso]);
  });

  it('ningún handler queda sin permiso declarado', () => {
    const sinPermiso = handlersEnOrden().filter((h) => !h.permisos?.length);

    expect(sinPermiso.map((h) => h.name)).toEqual([]);
  });

  it('registra el contexto de auditoría a nivel de clase', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, DestinosController)).toEqual({
      contexto: 'Destinos',
      entidad: 'Destino',
    });
  });
});

describe('DestinosController · delegación', () => {
  let controller: DestinosController;
  let service: jest.Mocked<Partial<DestinosService>>;

  beforeEach(async () => {
    service = {
      listarDestinos: jest.fn(),
      obtenerDestino: jest.fn(),
      crearDestino: jest.fn(),
      editarDestino: jest.fn(),
      eliminarDestino: jest.fn(),
      listarUnidades: jest.fn(),
      listarFuncionariosUnidad: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DestinosController],
      providers: [{ provide: DestinosService, useValue: service }],
    }).compile();

    controller = module.get<DestinosController>(DestinosController);
  });

  it('pasa el query al listar destinos', () => {
    controller.listarDestinos({ page: 2, activo: true });

    expect(service.listarDestinos).toHaveBeenCalledWith({ page: 2, activo: true });
  });

  it('pasa el id al obtener un destino', () => {
    controller.obtenerDestino(200);

    expect(service.obtenerDestino).toHaveBeenCalledWith(200);
  });

  it('pasa el dto al crear', () => {
    const dto = { persona_id: 1, unidad_id: 2, fecha_inicio: '2026-09-01', numero_orden: 'O.D. 1' };

    controller.crearDestino(dto);

    expect(service.crearDestino).toHaveBeenCalledWith(dto);
  });

  it('pasa id y dto al editar', () => {
    controller.editarDestino(200, { posicion_destino: 'Jefe' });

    expect(service.editarDestino).toHaveBeenCalledWith(200, { posicion_destino: 'Jefe' });
  });

  it('pasa el id al eliminar', () => {
    controller.eliminarDestino(200);

    expect(service.eliminarDestino).toHaveBeenCalledWith(200);
  });

  it('pasa unidadId y query al listar la dotación de una unidad', () => {
    controller.listarFuncionariosUnidad(5, { activo: true });

    expect(service.listarFuncionariosUnidad).toHaveBeenCalledWith(5, { activo: true });
  });
});

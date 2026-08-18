import { Test, TestingModule } from '@nestjs/testing';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

const metaDe = (handler: string) => {
  const fn = (CatalogosController.prototype as any)[handler];
  return {
    path: Reflect.getMetadata(PATH_METADATA, fn) as string,
    method: Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod,
    permisos: Reflect.getMetadata(PERMISSIONS_KEY, fn) as string[] | undefined,
  };
};

describe('CatalogosController · unidades', () => {
  // Solo se cubren los tres endpoints de escritura agregados con este módulo.
  // Los GET del catálogo son previos y quedan fuera de alcance.

  it.each([
    ['crearUnidad', RequestMethod.POST, 'unidades'],
    ['editarUnidad', RequestMethod.PATCH, 'unidades/:unidadId'],
    ['darDeBajaUnidad', RequestMethod.DELETE, 'unidades/:unidadId'],
  ])('%s responde en el método y la ruta esperados', (handler, method, path) => {
    const meta = metaDe(handler);

    expect(meta.method).toBe(method);
    expect(meta.path).toBe(path);
  });

  it.each(['crearUnidad', 'editarUnidad', 'darDeBajaUnidad'])(
    '%s exige catalogos.gestionar',
    (handler) => {
      expect(metaDe(handler).permisos).toEqual(['catalogos.gestionar']);
    },
  );

  it('registra el contexto de auditoría a nivel de clase', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, CatalogosController)).toEqual({
      contexto: 'Catálogos',
      entidad: 'Unidad',
    });
  });
});

describe('CatalogosController · delegación de unidades', () => {
  let controller: CatalogosController;
  let service: jest.Mocked<Partial<CatalogosService>>;

  beforeEach(async () => {
    service = {
      crearUnidad: jest.fn(),
      editarUnidad: jest.fn(),
      darDeBajaUnidad: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogosController],
      providers: [{ provide: CatalogosService, useValue: service }],
    }).compile();

    controller = module.get<CatalogosController>(CatalogosController);
  });

  it('pasa el dto al crear', () => {
    const dto = { codigo: 'BAIII', denominacion: 'Base Aérea Nº 3' };

    controller.crearUnidad(dto);

    expect(service.crearUnidad).toHaveBeenCalledWith(dto);
  });

  it('pasa id y dto al editar', () => {
    controller.editarUnidad(5, { vigente: false });

    expect(service.editarUnidad).toHaveBeenCalledWith(5, { vigente: false });
  });

  it('pasa el id al dar de baja', () => {
    controller.darDeBajaUnidad(5);

    expect(service.darDeBajaUnidad).toHaveBeenCalledWith(5);
  });
});

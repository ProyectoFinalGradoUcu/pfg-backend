import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CatalogosController } from './catalogos.controller';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';

const handlers = () =>
  Object.getOwnPropertyNames(CatalogosController.prototype)
    .filter((nombre) => nombre !== 'constructor')
    .map((nombre) => ({ nombre, fn: (CatalogosController.prototype as any)[nombre] }))
    .filter(({ fn }) => typeof fn === 'function' && Reflect.hasMetadata(PATH_METADATA, fn))
    .map(({ nombre, fn }) => ({
      nombre,
      fn,
      path: Reflect.getMetadata(PATH_METADATA, fn) as string,
      method: Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod,
      permisos: Reflect.getMetadata(PERMISSIONS_KEY, fn) as string[] | undefined,
    }));

describe('CatalogosController · comandos y bases', () => {
  it.each([
    ['crearComando', RequestMethod.POST, 'unidades'],
    ['editarComando', RequestMethod.PATCH, 'unidades/:unidadId'],
    ['crearBase', RequestMethod.POST, 'sub-unidades'],
    ['editarBase', RequestMethod.PATCH, 'sub-unidades/:subUnidadId'],
  ])('%s responde en %s %s y exige catalogos.gestionar', (nombre, method, path) => {
    const h = handlers().find((x) => x.nombre === nombre)!;

    expect(h.method).toBe(method);
    expect(h.path).toBe(path);
    expect(h.permisos).toEqual(['catalogos.gestionar']);
  });

  it('no expone DELETE: la baja es lógica porque liquidación referencia las filas', () => {
    expect(handlers().some((h) => h.method === RequestMethod.DELETE)).toBe(false);
  });

  it('toda escritura exige catalogos.gestionar', () => {
    const escrituras = handlers().filter((h) => h.method !== RequestMethod.GET);

    expect(escrituras.length).toBe(4);
    expect(escrituras.every((h) => h.permisos?.includes('catalogos.gestionar'))).toBe(true);
  });

  it('audita comandos y bases con su propia entidad', () => {
    const entidad = (nombre: string) =>
      Reflect.getMetadata(AUDITAR_KEY, handlers().find((x) => x.nombre === nombre)!.fn)?.entidad;

    expect(entidad('crearComando')).toBe('Comando');
    expect(entidad('editarComando')).toBe('Comando');
    expect(entidad('crearBase')).toBe('Base');
    expect(entidad('editarBase')).toBe('Base');
  });

  it('registra el contexto de auditoría a nivel de clase', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, CatalogosController)).toEqual({
      contexto: 'Catálogos',
      entidad: 'Unidad',
    });
  });
});

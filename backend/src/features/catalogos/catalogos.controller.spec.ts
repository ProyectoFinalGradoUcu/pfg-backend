import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { CatalogosController } from './catalogos.controller';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

const metodosDelController = () =>
  Object.getOwnPropertyNames(CatalogosController.prototype)
    .filter((nombre) => nombre !== 'constructor')
    .map((nombre) => (CatalogosController.prototype as any)[nombre])
    .filter((fn) => typeof fn === 'function' && Reflect.hasMetadata(PATH_METADATA, fn));

describe('CatalogosController · unidades y sub-unidades', () => {
  // Unidades (comandos) y sub-unidades son catálogos de liquidación: acá solo se leen.

  it('no expone ningún endpoint de escritura', () => {
    const metodos = metodosDelController().map(
      (fn) => Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod,
    );

    expect(metodos.length).toBeGreaterThan(0);
    expect(metodos.every((m) => m === RequestMethod.GET)).toBe(true);
  });

  it('lista unidades y sub-unidades por GET', () => {
    const rutas = metodosDelController().map((fn) => Reflect.getMetadata(PATH_METADATA, fn));

    expect(rutas).toEqual(expect.arrayContaining(['unidades', 'sub-unidades']));
  });

  it('registra el contexto de auditoría a nivel de clase', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, CatalogosController)).toEqual({
      contexto: 'Catálogos',
      entidad: 'Unidad',
    });
  });
});

import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import { OrdenesDocumentosController } from './ordenes-documentos.controller.js';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { ALCANCE_KEY } from '../../lib/alcance/alcance.decorator';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

const handler = (nombre: string) => (OrdenesDocumentosController.prototype as any)[nombre];
const ALCANCE = { tipo: 'unidad', subUnidadIds: ['6'], comandoIds: [] } as any;

describe('OrdenesDocumentosController', () => {
  it('el path del controlador es ascensos/ordenes/:id/documentos', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OrdenesDocumentosController)).toBe(
      'ascensos/ordenes/:id/documentos',
    );
  });

  it.each([
    ['subir', RequestMethod.POST, ['ascensos.registrar']],
    ['descargar', RequestMethod.GET, undefined],
    ['quitar', RequestMethod.DELETE, ['ascensos.registrar']],
  ])('%s es %s :slot, permisos %j y alcance ascensos.ver', (nombre, metodo, permisos) => {
    expect(Reflect.getMetadata(PATH_METADATA, handler(nombre))).toBe(':slot');
    expect(Reflect.getMetadata(METHOD_METADATA, handler(nombre))).toBe(metodo);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(nombre))).toEqual(permisos);
    expect(Reflect.getMetadata(ALCANCE_KEY, handler(nombre))).toBe('ascensos.ver');
  });

  it('encabezados es HEAD :slot con alcance y va antes que el GET', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler('encabezados'))).toBe(':slot');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('encabezados'))).toBe(RequestMethod.HEAD);
    expect(Reflect.getMetadata(ALCANCE_KEY, handler('encabezados'))).toBe('ascensos.ver');
    const metodos = Object.getOwnPropertyNames(OrdenesDocumentosController.prototype);
    expect(metodos.indexOf('encabezados')).toBeLessThan(metodos.indexOf('descargar'));
  });

  it('quitar responde 200', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('quitar'))).toBe(HttpStatus.OK);
  });

  it('audita con contexto Ascensos y entidad Documento de orden de ascenso', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, OrdenesDocumentosController)).toMatchObject({
      contexto: 'Ascensos',
      entidad: 'Documento de orden de ascenso',
    });
  });

  describe('verificación de alcance', () => {
    const armar = () => {
      const orden: string[] = [];
      const documentos = {
        subir: jest.fn(() => {
          orden.push('subir');
          return Promise.resolve({});
        }),
        quitar: jest.fn(() => {
          orden.push('quitar');
          return Promise.resolve({});
        }),
        metadatos: jest.fn(() => {
          orden.push('metadatos');
          return Promise.resolve({ nombre_original: 'o.pdf', content_type: 'application/pdf', tamanio_bytes: 8n });
        }),
        obtener: jest.fn(() => {
          orden.push('obtener');
          return Promise.resolve({});
        }),
      };
      const ordenes = {
        verificarAlcanceOrden: jest.fn((_i: number, _a: any, modo: string) => {
          orden.push(`verificar:${modo}`);
          return Promise.resolve();
        }),
      };
      const controller = new OrdenesDocumentosController(documentos as any, ordenes as any);
      return { controller, documentos, ordenes, orden };
    };

    it('subir verifica en modo gestionar antes de subir', async () => {
      const { controller, ordenes, orden } = armar();
      await controller.subir(70, 'orden', {} as any, { id: 5 } as any, ALCANCE);
      expect(ordenes.verificarAlcanceOrden).toHaveBeenCalledWith(70, ALCANCE, 'gestionar');
      expect(orden).toEqual(['verificar:gestionar', 'subir']);
    });

    it('quitar verifica en modo gestionar antes de quitar', async () => {
      const { controller, ordenes, orden } = armar();
      await controller.quitar(70, 'orden', { id: 5 } as any, ALCANCE);
      expect(ordenes.verificarAlcanceOrden).toHaveBeenCalledWith(70, ALCANCE, 'gestionar');
      expect(orden).toEqual(['verificar:gestionar', 'quitar']);
    });

    it('encabezados verifica en modo ver antes de leer', async () => {
      const { controller, ordenes, orden } = armar();
      const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn() };
      await controller.encabezados(70, 'orden', res as any, ALCANCE);
      expect(ordenes.verificarAlcanceOrden).toHaveBeenCalledWith(70, ALCANCE, 'ver');
      expect(orden[0]).toBe('verificar:ver');
    });

    it('si la verificación falla no toca el servicio de documentos', async () => {
      const { controller, ordenes, documentos } = armar();
      ordenes.verificarAlcanceOrden.mockRejectedValueOnce(new Error('403'));
      await expect(controller.quitar(70, 'orden', { id: 5 } as any, ALCANCE)).rejects.toThrow('403');
      expect(documentos.quitar).not.toHaveBeenCalled();
    });
  });
});

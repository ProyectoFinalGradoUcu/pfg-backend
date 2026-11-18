import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import { DestinosDocumentosController } from './destinos-documentos.controller';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

const handler = (nombre: string) => (DestinosDocumentosController.prototype as any)[nombre];

describe('DestinosDocumentosController', () => {
  it('el path del controlador es destinos/:id/documentos', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DestinosDocumentosController)).toBe(
      'destinos/:id/documentos',
    );
  });

  it.each([
    ['subir', RequestMethod.POST, 'destinos.gestionar'],
    ['descargar', RequestMethod.GET, 'destinos.ver'],
    ['quitar', RequestMethod.DELETE, 'destinos.gestionar'],
  ])('%s es %s :slot y pide %s', (nombre, metodo, permiso) => {
    expect(Reflect.getMetadata(PATH_METADATA, handler(nombre))).toBe(':slot');
    expect(Reflect.getMetadata(METHOD_METADATA, handler(nombre))).toBe(metodo);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(nombre))).toEqual([permiso]);
  });

  it('encabezados es HEAD :slot, pide destinos.ver y va antes que el GET', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler('encabezados'))).toBe(':slot');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('encabezados'))).toBe(RequestMethod.HEAD);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler('encabezados'))).toEqual(['destinos.ver']);
    const metodos = Object.getOwnPropertyNames(DestinosDocumentosController.prototype);
    expect(metodos.indexOf('encabezados')).toBeLessThan(metodos.indexOf('descargar'));
  });

  it('encabezados responde 200 con los headers del documento y sin cuerpo', async () => {
    const documentos = {
      metadatos: jest.fn().mockResolvedValue({
        nombre_original: 'orden.pdf',
        content_type: 'application/pdf',
        tamanio_bytes: 8n,
      }),
    };
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn() };

    await new DestinosDocumentosController(documentos as any).encabezados(2, 'orden', res as any);

    expect(documentos.metadatos).toHaveBeenCalledWith(2n, 'orden');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '8');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalledWith();
  });

  it('quitar responde 200', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('quitar'))).toBe(HttpStatus.OK);
  });

  it('audita con contexto Destinos y entidad Documento de destino', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, DestinosDocumentosController)).toMatchObject({
      contexto: 'Destinos',
      entidad: 'Documento de destino',
    });
  });
});

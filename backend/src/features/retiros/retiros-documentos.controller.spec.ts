import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import { RetirosDocumentosController } from './retiros-documentos.controller';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

const handler = (nombre: string) => (RetirosDocumentosController.prototype as any)[nombre];

describe('RetirosDocumentosController', () => {
  it('el path del controlador es retiros/:id/documentos', () => {
    expect(Reflect.getMetadata(PATH_METADATA, RetirosDocumentosController)).toBe(
      'retiros/:id/documentos',
    );
  });

  it.each([
    ['subir', RequestMethod.POST, 'retiros.registrar'],
    ['descargar', RequestMethod.GET, 'retiros.ver'],
    ['quitar', RequestMethod.DELETE, 'retiros.registrar'],
  ])('%s es %s :slot y pide %s', (nombre, metodo, permiso) => {
    expect(Reflect.getMetadata(PATH_METADATA, handler(nombre))).toBe(':slot');
    expect(Reflect.getMetadata(METHOD_METADATA, handler(nombre))).toBe(metodo);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(nombre))).toEqual([permiso]);
  });

  it('encabezados es HEAD :slot, pide retiros.ver y va antes que el GET', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler('encabezados'))).toBe(':slot');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('encabezados'))).toBe(RequestMethod.HEAD);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler('encabezados'))).toEqual(['retiros.ver']);
    const metodos = Object.getOwnPropertyNames(RetirosDocumentosController.prototype);
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

    await new RetirosDocumentosController(documentos as any).encabezados(2, 'orden', res as any);

    expect(documentos.metadatos).toHaveBeenCalledWith(2, 'orden');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '8');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalledWith();
  });

  it('quitar responde 200', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('quitar'))).toBe(HttpStatus.OK);
  });

  it('audita con contexto Retiros y entidad Documento de retiro', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, RetirosDocumentosController)).toMatchObject({
      contexto: 'Retiros',
      entidad: 'Documento de retiro',
    });
  });
});

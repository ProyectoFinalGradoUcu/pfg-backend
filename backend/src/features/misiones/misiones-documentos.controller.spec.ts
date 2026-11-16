import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  AsignacionesMisionDocumentosController,
  ConvocatoriasDocumentosController,
} from './misiones-documentos.controller';
import { MisionesController } from './misiones.controller';
import { MisionesModule } from './misiones.module';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

describe.each([
  [ConvocatoriasDocumentosController, 'misiones/convocatorias/:id/documentos', 'Documento de convocatoria'],
  [AsignacionesMisionDocumentosController, 'misiones/asignaciones/:id/documentos', 'Documento de asignación a misión'],
] as const)('%p', (Controlador, path, entidad) => {
  const handler = (nombre: string) => (Controlador.prototype as any)[nombre];

  it(`el path del controlador es ${path}`, () => {
    expect(Reflect.getMetadata(PATH_METADATA, Controlador)).toBe(path);
  });

  it.each([
    ['subir', RequestMethod.POST, 'misiones.gestionar'],
    ['descargar', RequestMethod.GET, 'misiones.ver'],
    ['quitar', RequestMethod.DELETE, 'misiones.gestionar'],
  ])('%s es %s :slot y pide %s', (nombre, metodo, permiso) => {
    expect(Reflect.getMetadata(PATH_METADATA, handler(nombre))).toBe(':slot');
    expect(Reflect.getMetadata(METHOD_METADATA, handler(nombre))).toBe(metodo);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(nombre))).toEqual([permiso]);
  });

  it('encabezados es HEAD :slot, pide misiones.ver y va antes que el GET', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler('encabezados'))).toBe(':slot');
    expect(Reflect.getMetadata(METHOD_METADATA, handler('encabezados'))).toBe(RequestMethod.HEAD);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler('encabezados'))).toEqual(['misiones.ver']);
    const metodos = Object.getOwnPropertyNames(Controlador.prototype);
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

    await new Controlador(documentos as any).encabezados(2, 'orden', res as any);

    expect(documentos.metadatos).toHaveBeenCalledWith(2n, 'orden');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '8');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalledWith();
  });

  it('quitar responde 200', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('quitar'))).toBe(HttpStatus.OK);
  });

  it(`audita con contexto Misiones y entidad ${entidad}`, () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, Controlador)).toMatchObject({ contexto: 'Misiones', entidad });
  });
});

describe('MisionesModule', () => {
  it('registra los controladores de documentos antes que MisionesController', () => {
    const controllers: unknown[] = Reflect.getMetadata('controllers', MisionesModule);
    const posicion = controllers.indexOf(MisionesController);
    expect(controllers.indexOf(ConvocatoriasDocumentosController)).toBeLessThan(posicion);
    expect(controllers.indexOf(AsignacionesMisionDocumentosController)).toBeLessThan(posicion);
  });
});

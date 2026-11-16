import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { BadRequestException, HttpStatus, RequestMethod, StreamableFile, ValidationPipe } from '@nestjs/common';
import { Readable } from 'stream';
import { DesignacionesDocumentosController } from './designaciones-documentos.controller';
import { AdjuntarDesignacionesDto } from './dto/adjuntar-designaciones.dto';
import { CursosController } from './cursos.controller';
import { CursosModule } from './cursos.module';
import { ALCANCE_KEY } from '../../lib/alcance/alcance.decorator';
import { AUDITAR_KEY } from '../auditoria/decorators/auditar.decorator';

const handler = (nombre: string) => (DesignacionesDocumentosController.prototype as any)[nombre];
const ALCANCE = { tipo: 'unidad', subUnidadIds: ['6'], comandoIds: [] } as any;
const ARCHIVO = { originalname: 'orden.pdf' } as any;

describe('DesignacionesDocumentosController', () => {
  it('el path del controlador es cursos/:cursoId/designaciones', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DesignacionesDocumentosController)).toBe(
      'cursos/:cursoId/designaciones',
    );
  });

  it.each([
    ['adjuntarAVarias', RequestMethod.POST, 'documentos/:slot', 'cursos.gestionar'],
    ['subir', RequestMethod.POST, ':id/documentos/:slot', 'cursos.gestionar'],
    ['encabezados', RequestMethod.HEAD, ':id/documentos/:slot', 'cursos.ver'],
    ['descargar', RequestMethod.GET, ':id/documentos/:slot', 'cursos.ver'],
    ['quitar', RequestMethod.DELETE, ':id/documentos/:slot', 'cursos.gestionar'],
  ])('%s es %s %s y pide alcance %s', (nombre, metodo, path, permiso) => {
    expect(Reflect.getMetadata(PATH_METADATA, handler(nombre))).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler(nombre))).toBe(metodo);
    expect(Reflect.getMetadata(ALCANCE_KEY, handler(nombre))).toBe(permiso);
  });

  it('el HEAD va antes que el GET', () => {
    const metodos = Object.getOwnPropertyNames(DesignacionesDocumentosController.prototype);
    expect(metodos.indexOf('encabezados')).toBeLessThan(metodos.indexOf('descargar'));
  });

  it('quitar responde 200', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('quitar'))).toBe(HttpStatus.OK);
  });

  it('audita con contexto Cursos y entidad Documento de designación', () => {
    expect(Reflect.getMetadata(AUDITAR_KEY, DesignacionesDocumentosController)).toMatchObject({
      contexto: 'Cursos',
      entidad: 'Documento de designación',
    });
  });

  describe('verificación de alcance', () => {
    const armar = () => {
      const orden: string[] = [];
      const registrar = (paso: string, valor: unknown = {}) =>
        jest.fn(() => {
          orden.push(paso);
          return Promise.resolve(valor);
        });
      const documentos = {
        verificarVer: registrar('verificar:ver', undefined),
        verificarGestionar: registrar('verificar:gestionar', undefined),
        subir: registrar('subir'),
        subirAVarios: registrar('subirAVarios', { adjuntados: 3 }),
        quitar: registrar('quitar', null),
        metadatos: registrar('metadatos', {
          nombre_original: 'o.pdf',
          content_type: 'application/pdf',
          tamanio_bytes: 8n,
        }),
        obtener: registrar('obtener'),
      };
      const controller = new DesignacionesDocumentosController(documentos as any);
      return { controller, documentos, orden };
    };

    it('adjuntar a varias llama a subirAVarios con los ids parseados', async () => {
      const { controller, documentos, orden } = armar();

      const result = await controller.adjuntarAVarias(
        1,
        'boletin',
        ARCHIVO,
        { designacion_ids: '5,6,7' },
        { id: 9 } as any,
        ALCANCE,
      );

      expect(documentos.verificarGestionar).toHaveBeenCalledWith(1n, [5n, 6n, 7n], ALCANCE);
      expect(documentos.subirAVarios).toHaveBeenCalledWith([5n, 6n, 7n], 'boletin', ARCHIVO, 9n);
      expect(orden).toEqual(['verificar:gestionar', 'subirAVarios']);
      expect(result).toEqual({ adjuntados: 3 });
    });

    it('subir verifica en modo gestionar antes de subir', async () => {
      const { controller, documentos, orden } = armar();

      await controller.subir(1, 5, 'orden', ARCHIVO, { id: 9 } as any, ALCANCE);

      expect(documentos.verificarGestionar).toHaveBeenCalledWith(1n, [5n], ALCANCE);
      expect(documentos.subir).toHaveBeenCalledWith(5n, 'orden', ARCHIVO, 9n);
      expect(orden).toEqual(['verificar:gestionar', 'subir']);
    });

    it('quitar verifica en modo gestionar antes de quitar', async () => {
      const { controller, documentos, orden } = armar();

      await controller.quitar(1, 5, 'orden', { id: 9 } as any, ALCANCE);

      expect(documentos.verificarGestionar).toHaveBeenCalledWith(1n, [5n], ALCANCE);
      expect(documentos.quitar).toHaveBeenCalledWith(5n, 'orden', 9n);
      expect(orden).toEqual(['verificar:gestionar', 'quitar']);
    });

    it('encabezados verifica en modo ver y responde 200 con los headers y sin cuerpo', async () => {
      const { controller, documentos, orden } = armar();
      const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn() };

      await controller.encabezados(1, 5, 'orden', res as any, ALCANCE);

      expect(documentos.verificarVer).toHaveBeenCalledWith(1n, 5n, ALCANCE);
      expect(documentos.metadatos).toHaveBeenCalledWith(5n, 'orden');
      expect(orden).toEqual(['verificar:ver', 'metadatos']);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '8');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalledWith();
    });

    it('descargar verifica en modo ver antes de leer el archivo y respeta ?download=1', async () => {
      const { controller, documentos, orden } = armar();
      documentos.obtener.mockImplementationOnce(() => {
        orden.push('obtener');
        return Promise.resolve({
          nombre_original: 'o.pdf',
          content_type: 'application/pdf',
          tamanio_bytes: 8n,
          stream: Readable.from([]),
        });
      });
      const res = { setHeader: jest.fn(), on: jest.fn() };

      const result = await controller.descargar(1, 5, 'orden', res as any, ALCANCE, '1');

      expect(documentos.verificarVer).toHaveBeenCalledWith(1n, 5n, ALCANCE);
      expect(documentos.obtener).toHaveBeenCalledWith(5n, 'orden');
      expect(orden).toEqual(['verificar:ver', 'obtener']);
      expect(result).toBeInstanceOf(StreamableFile);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringMatching(/^attachment/));
    });

    it('si la verificación falla no toca el servicio de documentos', async () => {
      const { controller, documentos } = armar();
      documentos.verificarGestionar.mockRejectedValueOnce(new Error('404'));

      await expect(
        controller.adjuntarAVarias(1, 'orden', ARCHIVO, { designacion_ids: '5' }, { id: 9 } as any, ALCANCE),
      ).rejects.toThrow('404');
      expect(documentos.subirAVarios).not.toHaveBeenCalled();
    });
  });

  describe('AdjuntarDesignacionesDto', () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const validar = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: AdjuntarDesignacionesDto });

    it('acepta ids separados por coma', async () => {
      await expect(validar({ designacion_ids: '5,6,7' })).resolves.toMatchObject({
        designacion_ids: '5,6,7',
      });
    });

    it.each([[''], ['5,a'], ['5,,6'], ['5, 6'], ['-5'], ['5,']])(
      '400 si `designacion_ids` no es una lista de números (%p)',
      async (valor) => {
        await expect(validar({ designacion_ids: valor })).rejects.toThrow(BadRequestException);
      },
    );

    it('400 si un id tiene más de 18 dígitos', async () => {
      await expect(validar({ designacion_ids: '1234567890123456789' })).rejects.toThrow(BadRequestException);
      await expect(validar({ designacion_ids: '123456789012345678' })).resolves.toBeDefined();
    });

    it('acepta 500 ids y da 400 con 501', async () => {
      const lista = (n: number) => Array.from({ length: n }, (_, i) => i + 1).join(',');
      await expect(validar({ designacion_ids: lista(500) })).resolves.toBeDefined();
      await expect(validar({ designacion_ids: lista(501) })).rejects.toThrow(BadRequestException);
    });

    it('400 si falta designacion_ids', async () => {
      await expect(validar({})).rejects.toThrow(BadRequestException);
    });
  });
});

describe('CursosModule', () => {
  it('registra el controlador de documentos antes que CursosController', () => {
    const controllers: unknown[] = Reflect.getMetadata('controllers', CursosModule);
    expect(controllers.indexOf(DesignacionesDocumentosController)).toBeGreaterThanOrEqual(0);
    expect(controllers.indexOf(DesignacionesDocumentosController)).toBeLessThan(
      controllers.indexOf(CursosController),
    );
  });
});

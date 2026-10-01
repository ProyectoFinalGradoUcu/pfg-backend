import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ServiceResponseExceptionFilter } from './service-response-exception.filter';

const makeHost = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', originalUrl: '/personas/1/documentos' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

describe('ServiceResponseExceptionFilter', () => {
  const filter = new ServiceResponseExceptionFilter();

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('sin data, service_data es null', () => {
    const { host, status, json } = makeHost();

    filter.catch(new NotFoundException('Documento no encontrado'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      service_response: {
        service_status: { http_status: '404', http_message: 'Documento no encontrado' },
        service_data: null,
      },
    });
  });

  it('con data, la reenvía en service_data con los BigInt como string', () => {
    const { host, status, json } = makeHost();

    filter.catch(
      new ConflictException({
        message: 'Ya existe un documento con el nombre «cedula.pdf»',
        data: { motivo: 'nombre', existente: { id: 7n, tamanio_bytes: 184223n } },
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      service_response: {
        service_status: {
          http_status: '409',
          http_message: 'Ya existe un documento con el nombre «cedula.pdf»',
        },
        service_data: { motivo: 'nombre', existente: { id: '7', tamanio_bytes: '184223' } },
      },
    });
  });

  it('un error que no es HTTP responde 500 genérico, sin el mensaje interno', () => {
    const { host, status, json } = makeHost();

    filter.catch(
      new Error('Invalid `tx.personas.delete()` invocation: Foreign key constraint violated'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      service_response: {
        service_status: { http_status: '500', http_message: 'Error interno del servidor' },
        service_data: null,
      },
    });
  });

  it('un error http-errors 4xx expuesto (p. ej. JSON mal formado) conserva su status y mensaje', () => {
    const { host, status, json } = makeHost();
    const error = Object.assign(new SyntaxError('Unexpected token } in JSON at position 9'), {
      status: 400,
      statusCode: 400,
      expose: true,
      type: 'entity.parse.failed',
    });

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      service_response: {
        service_status: {
          http_status: '400',
          http_message: 'Unexpected token } in JSON at position 9',
        },
        service_data: null,
      },
    });
  });

  it('los errores de validación siguen uniendo los mensajes y sin data', () => {
    const { host, json } = makeHost();

    filter.catch(new BadRequestException(['descripcion es muy larga', 'otro error']), host);

    expect(json).toHaveBeenCalledWith({
      service_response: {
        service_status: {
          http_status: '400',
          http_message: 'descripcion es muy larga, otro error',
        },
        service_data: null,
      },
    });
  });
});

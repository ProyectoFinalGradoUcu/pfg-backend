import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { ServiceResponseInterceptor } from './service-response.interceptor';

const makeContext = (): ExecutionContext => {
  const req = { method: 'DELETE', url: '/personas/1/familiares/2', params: {}, query: {}, body: null };
  const res = { statusCode: 200 };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
};

const makeHandler = (returnValue: unknown): CallHandler => ({
  handle: () => of(returnValue),
});

describe('ServiceResponseInterceptor', () => {
  let interceptor: ServiceResponseInterceptor;

  beforeEach(() => {
    interceptor = new ServiceResponseInterceptor();
  });

  it('envuelve undefined como service_data: null en vez de romper (ej: un DELETE sin body)', (done) => {
    interceptor.intercept(makeContext(), makeHandler(undefined)).subscribe((result: any) => {
      expect(result.service_response.service_data).toBeNull();
      done();
    });
  });

  it('envuelve un valor normal sin modificarlo', (done) => {
    interceptor.intercept(makeContext(), makeHandler({ id: 1 })).subscribe((result: any) => {
      expect(result.service_response.service_data).toEqual({ id: 1 });
      done();
    });
  });

  it('convierte BigInt a string dentro del payload', (done) => {
    interceptor.intercept(makeContext(), makeHandler({ id: 5n })).subscribe((result: any) => {
      expect(result.service_response.service_data).toEqual({ id: '5' });
      done();
    });
  });
});

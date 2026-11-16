import { Reflector } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import { ThrottleSoloMarcadosGuard } from './throttle-solo-marcados.guard';

class Controlador {
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  marcado() {}

  sinMarcar() {}
}

const contexto = (handler: () => void) =>
  ({ getHandler: () => handler, getClass: () => Controlador }) as any;

describe('ThrottleSoloMarcadosGuard', () => {
  const guard = new ThrottleSoloMarcadosGuard({ throttlers: [] } as any, {} as any, new Reflector());

  it('solo limita los endpoints con @Throttle', async () => {
    expect(await (guard as any).shouldSkip(contexto(Controlador.prototype.marcado))).toBe(false);
    expect(await (guard as any).shouldSkip(contexto(Controlador.prototype.sinMarcar))).toBe(true);
  });

  it('cuenta por IP + usuario, sin importar mayúsculas ni espacios', async () => {
    const tracker = (body: any) => (guard as any).getTracker({ ip: '10.0.0.1', body });

    expect(await tracker({ username: ' Juan@FAU.mil.uy ' })).toBe('10.0.0.1:juan@fau.mil.uy');
    expect(await tracker({ username: 'otro@fau.mil.uy' })).toBe('10.0.0.1:otro@fau.mil.uy');
  });

  it('sin usuario en el body cuenta solo por IP', async () => {
    const tracker = (body: any) => (guard as any).getTracker({ ip: '10.0.0.1', body });

    expect(await tracker({ token: 'abc' })).toBe('10.0.0.1');
    expect(await tracker(undefined)).toBe('10.0.0.1');
  });
});

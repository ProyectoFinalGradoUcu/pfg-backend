import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { CACHE_FOTO_VERSIONADA, PersonasFotoController } from './personas-foto.controller';
import { PersonasFotoService } from './personas-foto.service';

const GLOBAL = { tipo: 'global' as const };

const makeRes = () => {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((nombre: string, valor: string) => {
      headers[nombre] = valor;
    }),
    on: jest.fn(),
  };
  return { res: res as unknown as Response, headers };
};

describe('PersonasFotoController', () => {
  let fotos: { obtener: jest.Mock };
  let controller: PersonasFotoController;

  beforeEach(() => {
    fotos = {
      obtener: jest.fn().mockResolvedValue({
        stream: new PassThrough(),
        nombre_original: 'foto.jpg',
        content_type: 'image/jpeg',
        tamanio_bytes: 6n,
      }),
    };
    controller = new PersonasFotoController(fotos as unknown as PersonasFotoService);
  });

  it('con ?v= la foto se puede cachear', async () => {
    const { res, headers } = makeRes();

    await controller.ver(42, GLOBAL, res, '90');

    expect(headers['Cache-Control']).toBe(CACHE_FOTO_VERSIONADA);
  });

  it('sin ?v= no se cachea: la misma URL puede pasar a ser otra foto', async () => {
    const { res, headers } = makeRes();

    await controller.ver(42, GLOBAL, res);

    expect(headers['Cache-Control']).toBe('private, no-store');
  });
});

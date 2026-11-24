import { fotoBase, fotoComando } from './catalogos.auditoria';
import type { PrismaService } from '../../lib/prisma.service';

const makePrisma = () => ({
  unidades: { findUnique: jest.fn() },
  sub_unidades: { findUnique: jest.fn() },
});

describe('CatalogosAuditoria', () => {
  let prisma: ReturnType<typeof makePrisma>;
  const db = () => prisma as unknown as PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it('foto del comando con código, denominación y vigencia', async () => {
    prisma.unidades.findUnique.mockResolvedValue({ codigo: 'CAO', denominacion: 'C.A.O.', vigente: true });

    expect(await fotoComando(1n, db())).toEqual({
      nombre: 'C.A.O.',
      campos: { codigo: 'CAO', denominacion: 'C.A.O.', vigente: true },
    });
  });

  it('foto del comando que no existe es null', async () => {
    prisma.unidades.findUnique.mockResolvedValue(null);
    expect(await fotoComando(1n, db())).toBeNull();
  });

  it('foto de la base con el comando en texto', async () => {
    prisma.sub_unidades.findUnique.mockResolvedValue({
      codigo: 'BAI',
      denominacion: 'B.A.I.',
      vigente: false,
      unidades: { denominacion: 'C.A.O.' },
    });

    expect(await fotoBase(5n, db())).toEqual({
      nombre: 'B.A.I.',
      campos: { codigo: 'BAI', denominacion: 'B.A.I.', comando: 'C.A.O.', vigente: false },
    });
  });

  it('foto de la base que no existe es null', async () => {
    prisma.sub_unidades.findUnique.mockResolvedValue(null);
    expect(await fotoBase(5n, db())).toBeNull();
  });
});

import { fotoAsignacionComision, fotoComision } from './comisiones.auditoria';
import type { PrismaService } from '../../lib/prisma.service';

const makePrisma = () => ({
  comisiones: { findUnique: jest.fn() },
  asignaciones_comision: { findUnique: jest.fn() },
});
const db = (p: object) => p as unknown as PrismaService;

describe('fotos de comisiones', () => {
  it('comisión', async () => {
    const prisma = makePrisma();
    prisma.comisiones.findUnique.mockResolvedValue({ denominacion: 'Antártida', vigente: true });
    expect(await fotoComision(1n, db(prisma))).toEqual({
      nombre: 'Antártida',
      campos: { denominacion: 'Antártida', vigente: true },
    });
  });

  it('comisión inexistente da null', async () => {
    const prisma = makePrisma();
    prisma.comisiones.findUnique.mockResolvedValue(null);
    expect(await fotoComision(1n, db(prisma))).toBeNull();
  });

  it('asignación con persona y comisión en texto', async () => {
    const prisma = makePrisma();
    prisma.asignaciones_comision.findUnique.mockResolvedValue({
      cargo: 'Vocal',
      fecha_inicio: new Date('2026-02-01T00:00:00Z'),
      fecha_fin: null,
      numero_orden: null,
      boletin: 'B 9',
      personas: { id: 1n, primer_nombre: 'Juan', primer_apellido: 'Pérez', relaciones_laborales: [{ grados: { denominacion: 'Sargento' } }] },
      comisiones: { denominacion: 'Antártida' },
    });
    expect(await fotoAsignacionComision(2n, db(prisma))).toEqual({
      nombre: 'Sargento Juan Pérez en Antártida',
      campos: {
        persona: 'Sargento Juan Pérez',
        comision: 'Antártida',
        cargo: 'Vocal',
        fecha_inicio: '2026-02-01',
        fecha_fin: null,
        numero_orden: null,
        boletin: 'B 9',
      },
    });
  });

  it('asignación inexistente da null', async () => {
    const prisma = makePrisma();
    prisma.asignaciones_comision.findUnique.mockResolvedValue(null);
    expect(await fotoAsignacionComision(2n, db(prisma))).toBeNull();
  });
});

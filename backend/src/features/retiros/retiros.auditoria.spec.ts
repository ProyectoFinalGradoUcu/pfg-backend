import { fotoDocumentoRetiro, fotoReincorporacion, fotoRetiro } from './retiros.auditoria';
import type { PrismaService } from '../../lib/prisma.service';

const makePrisma = () => ({
  retiros: { findUnique: jest.fn(), findFirst: jest.fn() },
  relaciones_laborales: { findMany: jest.fn(), findUnique: jest.fn() },
});
const db = (p: object) => p as unknown as PrismaService;

const personas = {
  id: 1n,
  primer_nombre: 'Ana',
  primer_apellido: 'Gómez',
  relaciones_laborales: [{ grados: { denominacion: 'Cabo' } }],
};

describe('fotos de retiros', () => {
  it('retiro con catálogos en texto', async () => {
    const prisma = makePrisma();
    prisma.retiros.findUnique.mockResolvedValue({
      fecha_retiro: new Date('2026-08-29T00:00:00Z'),
      hora_retiro: new Date('1970-01-01T15:00:00Z'),
      motivo: null,
      numero_orden: 'O.D. 1',
      boletin: null,
      observaciones: null,
      personas,
      motivos_baja: { denominacion: 'Retiro voluntario' },
      relaciones_laborales: { grados: { denominacion: 'Cabo' }, sub_unidades: { denominacion: 'Base Aérea N°1' } },
    });
    const foto = await fotoRetiro(4n, db(prisma));
    expect(foto).toEqual({
      nombre: 'Cabo Ana Gómez',
      campos: {
        persona: 'Cabo Ana Gómez',
        grado: 'Cabo',
        sub_unidad: 'Base Aérea N°1',
        fecha_retiro: '2026-08-29',
        hora_retiro: '15:00:00',
        motivo_baja: 'Retiro voluntario',
        motivo: null,
        numero_orden: 'O.D. 1',
        boletin: null,
        observaciones: null,
      },
    });
  });

  it('retiro inexistente da null', async () => {
    const prisma = makePrisma();
    prisma.retiros.findUnique.mockResolvedValue(null);
    expect(await fotoRetiro(4n, db(prisma))).toBeNull();
  });

  it('reincorporación con datos de cálculo', async () => {
    const prisma = makePrisma();
    prisma.retiros.findUnique.mockResolvedValue({
      persona_id: 1n,
      fecha_retiro: new Date('2026-01-01T00:00:00Z'),
      personas,
    });
    prisma.retiros.findFirst.mockResolvedValue(null);
    prisma.relaciones_laborales.findMany.mockResolvedValue([
      {
        id: 20n,
        estado: 'activo',
        fecha_inicio: new Date('2026-03-01T00:00:00Z'),
        fecha_fin: null,
        haber_retiro: { toString: () => '45000.5', valueOf: () => 45000.5 },
        porcentaje_progresivo: 0.3,
        situaciones: { codigo: 'SIT17', denominacion: 'Reincorporado' },
        grados_relaciones_laborales_grado_reincorporacion_idTogrados: { id: 3n, denominacion: 'Cabo' },
      },
    ]);
    prisma.relaciones_laborales.findUnique.mockResolvedValue({
      grados: { denominacion: 'Cabo' },
      sub_unidades: { denominacion: 'Base Aérea N°1' },
    });
    const foto = await fotoReincorporacion(4n, db(prisma));
    expect(foto?.campos).toEqual({
      persona: 'Cabo Ana Gómez',
      fecha_reincorporacion: '2026-03-01',
      situacion: 'Reincorporado',
      grado: 'Cabo',
      sub_unidad: 'Base Aérea N°1',
      grado_reincorporacion: 'Cabo',
      haber_retiro: 45000.5,
      porcentaje_progresivo: 0.3,
    });
  });

  it('sin reincorporación da null', async () => {
    const prisma = makePrisma();
    prisma.retiros.findUnique.mockResolvedValue({ persona_id: 1n, fecha_retiro: new Date(), personas });
    prisma.retiros.findFirst.mockResolvedValue(null);
    prisma.relaciones_laborales.findMany.mockResolvedValue([]);
    expect(await fotoReincorporacion(4n, db(prisma))).toBeNull();
  });

  it('documento del retiro según el slot', async () => {
    const prisma = makePrisma();
    prisma.retiros.findUnique.mockResolvedValue({
      personas,
      archivo_orden: { nombre_original: 'orden.pdf' },
      archivo_boletin: null,
    });
    const foto = await fotoDocumentoRetiro(4n, db(prisma), { id: '4', slot: 'orden' });
    expect(foto).toEqual({
      nombre: 'Cabo Ana Gómez',
      campos: { retiro: 'Cabo Ana Gómez', documento: 'Orden', archivo: 'orden.pdf' },
    });
    expect(await fotoDocumentoRetiro(4n, db(prisma), { id: '4', slot: 'boletin' })).toBeNull();
  });
});

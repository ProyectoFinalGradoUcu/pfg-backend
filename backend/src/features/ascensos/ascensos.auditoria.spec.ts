import {
  fotoAscenso,
  fotoDocumentoOrdenAscenso,
  fotoOrdenAscenso,
  fotoReglaAscenso,
} from './ascensos.auditoria.js';
import type { PrismaService } from '../../lib/prisma.service.js';

const makePrisma = () => ({
  ascensos_ordenes: { findUnique: jest.fn() },
  ascensos: { findUnique: jest.fn() },
  ascensos_reglas: { findUnique: jest.fn(), findFirst: jest.fn() },
});
const db = (p: object) => p as unknown as PrismaService;

const persona = { primer_nombre: 'Juan', primer_apellido: 'Pérez' };

describe('fotos de ascensos', () => {
  it('orden con sus ascensos legibles', async () => {
    const prisma = makePrisma();
    prisma.ascensos_ordenes.findUnique.mockResolvedValue({
      numero_orden: 'O.C. 12',
      fecha_orden: new Date('2026-05-01T00:00:00Z'),
      boletin: 'B 3',
      observaciones: null,
      ascensos: [{ personas: persona, grados_grado_anterior: { denominacion: 'Cabo' }, grados: { denominacion: 'Sargento' } }],
    });
    const foto = await fotoOrdenAscenso(1n, db(prisma));
    expect(foto).toEqual({
      nombre: 'O.C. 12',
      campos: {
        numero_orden: 'O.C. 12',
        fecha_orden: '2026-05-01',
        boletin: 'B 3',
        observaciones: null,
        ascensos: ['Juan Pérez: Cabo → Sargento'],
      },
    });
  });

  it('orden inexistente da null', async () => {
    const prisma = makePrisma();
    prisma.ascensos_ordenes.findUnique.mockResolvedValue(null);
    expect(await fotoOrdenAscenso(1n, db(prisma))).toBeNull();
  });

  it('ascenso con grados y orden en texto', async () => {
    const prisma = makePrisma();
    prisma.ascensos.findUnique.mockResolvedValue({
      personas: persona,
      grados_grado_anterior: { denominacion: 'Cabo' },
      grados: { denominacion: 'Sargento' },
      fecha_ascenso: new Date('2026-05-01T00:00:00Z'),
      numero_orden: null,
      observaciones: null,
      cumplia_requisitos: false,
      motivo_excepcion: 'Mérito',
      ascensos_ordenes: { numero_orden: 'O.C. 12' },
    });
    const foto = await fotoAscenso(5n, db(prisma));
    expect(foto?.nombre).toBe('Cabo Juan Pérez a Sargento');
    expect(foto?.campos).toMatchObject({
      persona: 'Cabo Juan Pérez',
      grado_anterior: 'Cabo',
      grado: 'Sargento',
      fecha_ascenso: '2026-05-01',
      orden: 'O.C. 12',
      cumplia_requisitos: false,
      motivo_excepcion: 'Mérito',
    });
  });

  it('ascenso inexistente da null', async () => {
    const prisma = makePrisma();
    prisma.ascensos.findUnique.mockResolvedValue(null);
    expect(await fotoAscenso(5n, db(prisma))).toBeNull();
  });

  const regla = (extra: object = {}) => ({
    id: 3n,
    nombre: 'Cabo a Sargento',
    dias_minimos: 1460,
    edad_maxima: null,
    notas: null,
    activo: true,
    vigente_hasta: null,
    grado_origen_id: 7n,
    grado_origen: { denominacion: 'Cabo' },
    grado_destino: { denominacion: 'Sargento' },
    requisitos: [
      { descripcion: 'Curso de pasaje', anios_antiguedad: null, cursos: [{ curso: { nombre_curso: 'Pasaje a Sgto.' } }] },
      { descripcion: 'Antigüedad', anios_antiguedad: 4, cursos: [] },
    ],
    ...extra,
  });

  it('regla vigente con requisitos en texto', async () => {
    const prisma = makePrisma();
    prisma.ascensos_reglas.findUnique.mockResolvedValue(regla());
    const foto = await fotoReglaAscenso(3n, db(prisma));
    expect(foto?.campos).toEqual({
      nombre: 'Cabo a Sargento',
      grado_origen: 'Cabo',
      grado_destino: 'Sargento',
      dias_minimos: 1460,
      edad_maxima: null,
      notas: null,
      activo: true,
      requisitos: ['Curso de pasaje (Pasaje a Sgto.)', 'Antigüedad (4 años)'],
    });
    expect(prisma.ascensos_reglas.findFirst.mock.calls).toHaveLength(0);
  });

  it('regla cerrada toma la versión que la reemplazó', async () => {
    const prisma = makePrisma();
    prisma.ascensos_reglas.findUnique.mockResolvedValue(regla({ vigente_hasta: new Date() }));
    prisma.ascensos_reglas.findFirst.mockResolvedValue(regla({ id: 9n, dias_minimos: 1095 }));
    const foto = await fotoReglaAscenso(3n, db(prisma));
    expect(foto?.campos.dias_minimos).toBe(1095);
    expect(prisma.ascensos_reglas.findFirst.mock.calls[0][0]).toMatchObject({
      where: { grado_origen_id: 7n, id: { gt: 3n } },
      orderBy: { id: 'asc' },
    });
  });

  it('regla inexistente da null', async () => {
    const prisma = makePrisma();
    prisma.ascensos_reglas.findUnique.mockResolvedValue(null);
    expect(await fotoReglaAscenso(3n, db(prisma))).toBeNull();
  });

  it('documento de la orden según el slot', async () => {
    const prisma = makePrisma();
    prisma.ascensos_ordenes.findUnique.mockResolvedValue({
      numero_orden: 'O.C. 12',
      archivo_orden: null,
      archivo_boletin: { nombre_original: 'resolucion.pdf' },
    });
    const foto = await fotoDocumentoOrdenAscenso(1n, db(prisma), { id: '1', slot: 'boletin' });
    expect(foto).toEqual({
      nombre: 'O.C. 12',
      campos: { orden: 'O.C. 12', documento: 'Resolución', archivo: 'resolucion.pdf' },
    });
  });

  it('documento sin archivo en el slot da null', async () => {
    const prisma = makePrisma();
    prisma.ascensos_ordenes.findUnique.mockResolvedValue({ numero_orden: null, archivo_orden: null, archivo_boletin: null });
    expect(await fotoDocumentoOrdenAscenso(1n, db(prisma), { slot: 'orden' })).toBeNull();
    expect(await fotoDocumentoOrdenAscenso(1n, db(prisma), { slot: 'otro' })).toBeNull();
  });
});

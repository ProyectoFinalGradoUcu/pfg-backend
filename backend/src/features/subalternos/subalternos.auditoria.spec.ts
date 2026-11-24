import { fotoFamiliar, fotoLegajoMilitar, fotoPersona } from './subalternos.auditoria';
import type { PrismaService } from '../../lib/prisma.service';

const den = (denominacion: string) => ({ denominacion });

const persona = (relacion: Record<string, unknown> = {}, legajo: Record<string, unknown> | null = null) => ({
  cedula: '12345678',
  primer_nombre: 'Juan',
  segundo_nombre: null,
  primer_apellido: 'Pérez',
  segundo_apellido: null,
  es_civil: false,
  legajo_militar: legajo,
  relaciones_laborales: [
    {
      tipo_funcionario: 'subalterno',
      fecha_inicio: new Date('2020-03-01T00:00:00Z'),
      prima_tecnica: 'VACIO',
      tiene_mando: false,
      observaciones: null,
      codigos_legajo: null,
      mutaciones: null,
      derecha: 10,
      numor: 5,
      grados: den('Sgto.'),
      escalafones: den('(S.T.)'),
      regimenes: null,
      programas: null,
      situaciones: null,
      sub_unidades: den('E.T.A.'),
      unidades: null,
      ...relacion,
    },
  ],
});

describe('fotos de subalternos', () => {
  const makePrisma = () => ({
    personas: { findUnique: jest.fn(), findMany: jest.fn() },
    relaciones_familiares: { findFirst: jest.fn() },
  });
  const db = (p: object) => p as unknown as PrismaService;

  it('persona con códigos pasados a texto', async () => {
    const prisma = makePrisma();
    prisma.personas.findUnique.mockResolvedValue(persona());
    const foto = await fotoPersona(1n, db(prisma));
    expect(foto?.nombre).toBe('Sgto. Juan Pérez');
    expect(foto?.campos).toMatchObject({ tipo_funcionario: 'Subalterno', prima_tecnica: null, grado: 'Sgto.' });
  });

  it('una prima real se deja como está', async () => {
    const prisma = makePrisma();
    prisma.personas.findUnique.mockResolvedValue(persona({ prima_tecnica: 'A' }));
    expect((await fotoPersona(1n, db(prisma)))?.campos.prima_tecnica).toBe('A');
  });

  it('legajo con el nivel educativo legible', async () => {
    const prisma = makePrisma();
    prisma.personas.findUnique.mockResolvedValue(
      persona({}, { nivel_educativo: 'BACHILLERATO', fecha_ingreso_eta: null, fecha_egreso_eta: null, numero_orden_egreso_eta: 'OD 1' }),
    );
    const foto = await fotoLegajoMilitar(1n, db(prisma));
    expect(foto?.campos).toMatchObject({ nivel_educativo: 'Bachillerato', numero_orden_egreso_eta: 'OD 1' });
  });

  it('familiar con su grado', async () => {
    const prisma = makePrisma();
    prisma.relaciones_familiares.findFirst.mockResolvedValue({ tipo_relacion: 'Hermano', observaciones: null });
    prisma.personas.findMany.mockResolvedValue([
      { id: 5n, primer_nombre: 'Juan', primer_apellido: 'Pérez', relaciones_laborales: [{ grados: den('Cbo.') }] },
      { id: 6n, primer_nombre: 'Ana', primer_apellido: 'Gómez', relaciones_laborales: [{ grados: den('Sgto.') }] },
    ]);
    const foto = await fotoFamiliar(6n, db(prisma), { id: '5' });
    expect(foto).toEqual({
      nombre: 'Sgto. Ana Gómez',
      campos: { persona: 'Cbo. Juan Pérez', familiar: 'Sgto. Ana Gómez', tipo_relacion: 'Hermano', observaciones: null },
    });
  });
});

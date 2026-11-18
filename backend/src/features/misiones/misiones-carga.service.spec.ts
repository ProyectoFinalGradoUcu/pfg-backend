import { Workbook } from 'exceljs';
import { MisionesCargaService } from './misiones-carga.service';

const ENCABEZADOS = [
  'Misión *', 'País', 'N.º de orden de la convocatoria', 'Resolución de la convocatoria',
  'Fecha de salida', 'Fecha de llegada', 'Cédula *', 'Observaciones del funcionario',
];

const CHOQUE = {
  personas: { primer_nombre: 'Juan', primer_apellido: 'Pérez' },
  convocatorias: { misiones: { nombre_mision: 'Haití' } },
};

const makePrismaMock = () => ({
  misiones: {
    findMany: jest.fn().mockResolvedValue([{ id: 1n, nombre_mision: 'Congo' }]),
    create: jest.fn(),
  },
  personas: {
    findMany: jest.fn().mockResolvedValue([
      { id: 10n, cedula: '11111111', es_civil: false, primer_nombre: 'Juan', primer_apellido: 'Pérez' },
    ]),
  },
  convocatorias: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 50n, fecha_salida: null, fecha_llegada: null }),
    update: jest.fn(),
  },
  funcionarios_convocatorias: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 99n }),
  },
});

async function libro(filas: unknown[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Participantes');
  ws.addRow(ENCABEZADOS);
  filas.forEach((f) => ws.addRow(f));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('MisionesCargaService', () => {
  let service: MisionesCargaService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new MisionesCargaService(prisma as any);
  });

  describe('procesarCarga · solapamiento con otras convocatorias', () => {
    it('carga la fila si el funcionario no está en otra convocatoria en ese período', async () => {
      const r = await service.procesarCarga(
        await libro([['Congo', '', 'ORD-1', '', '2026-03-01', '2026-09-30', '11111111', '']]),
      );

      expect(r).toMatchObject({ exitosos: 1, errores: 0 });
      expect(prisma.funcionarios_convocatorias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            persona_id: { in: [10n] },
            convocatorias: {
              fecha_salida: { lte: new Date('2026-09-30') },
              OR: [{ fecha_llegada: null }, { fecha_llegada: { gte: new Date('2026-03-01') } }],
            },
          },
        }),
      );
    });

    it('rechaza la fila sin crear la convocatoria si el período se pisa con otra', async () => {
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([CHOQUE]);

      const r = await service.procesarCarga(
        await libro([['Congo', '', 'ORD-1', '', '2026-03-01', '2026-09-30', '11111111', '']]),
      );

      expect(r.resultados[0]).toMatchObject({
        estado: 'error',
        mensaje: 'Juan Pérez ya está en otra convocatoria en ese período (Haití).',
      });
      expect(prisma.convocatorias.create).not.toHaveBeenCalled();
      expect(prisma.funcionarios_convocatorias.create).not.toHaveBeenCalled();
    });

    it('no crea la misión nueva si el período se pisa con otra convocatoria', async () => {
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([CHOQUE]);

      const r = await service.procesarCarga(
        await libro([['Misión nueva', 'Líbano', 'ORD-1', '', '2026-03-01', '', '11111111', '']]),
      );

      expect(r).toMatchObject({ exitosos: 0, errores: 1 });
      expect(prisma.misiones.create).not.toHaveBeenCalled();
    });

    it('sin fechas en la fila, usa las de la convocatoria ya registrada y la excluye', async () => {
      prisma.convocatorias.findFirst.mockResolvedValue({
        id: 50n,
        fecha_salida: new Date('2026-03-01'),
        fecha_llegada: null,
      });

      const r = await service.procesarCarga(
        await libro([['Congo', '', 'ORD-1', '', '', '', '11111111', '']]),
      );

      expect(r).toMatchObject({ exitosos: 1, errores: 0 });
      expect(prisma.funcionarios_convocatorias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            persona_id: { in: [10n] },
            convocatoria_id: { not: 50n },
            convocatorias: {
              fecha_salida: { not: null },
              OR: [{ fecha_llegada: null }, { fecha_llegada: { gte: new Date('2026-03-01') } }],
            },
          },
        }),
      );
    });

    describe('al completar las fechas de una convocatoria ya registrada', () => {
      const conOtroParticipante = (choque: unknown[]) => {
        prisma.convocatorias.findFirst.mockResolvedValue({ id: 50n, fecha_salida: null, fecha_llegada: null });
        prisma.funcionarios_convocatorias.findMany.mockImplementation(async ({ where }) => {
          if (!where.persona_id?.in) return [{ persona_id: 20n }];
          return where.persona_id.in.includes(20n) ? choque : [];
        });
      };

      it('rechaza la fila si deja a otro participante solapado, sin tocar la convocatoria', async () => {
        conOtroParticipante([{ ...CHOQUE, personas: { primer_nombre: 'Ana', primer_apellido: 'Gómez' } }]);

        const r = await service.procesarCarga(
          await libro([['Congo', '', 'ORD-1', '', '2026-03-01', '2026-09-30', '11111111', '']]),
        );

        expect(r.resultados[0]).toMatchObject({
          estado: 'error',
          mensaje: 'Completar las fechas de la convocatoria dejaría a Ana Gómez en otra convocatoria del mismo período (Haití).',
        });
        expect(prisma.convocatorias.update).not.toHaveBeenCalled();
        expect(prisma.funcionarios_convocatorias.create).not.toHaveBeenCalled();
      });

      it('controla a los otros participantes con el período nuevo y carga la fila si no hay choques', async () => {
        conOtroParticipante([]);
        prisma.convocatorias.update.mockResolvedValue({ id: 50n });

        const r = await service.procesarCarga(
          await libro([['Congo', '', 'ORD-1', '', '2026-03-01', '2026-09-30', '11111111', '']]),
        );

        expect(r).toMatchObject({ exitosos: 1, errores: 0 });
        expect(prisma.funcionarios_convocatorias.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              persona_id: { in: [20n] },
              convocatoria_id: { not: 50n },
              convocatorias: {
                fecha_salida: { lte: new Date('2026-09-30') },
                OR: [{ fecha_llegada: null }, { fecha_llegada: { gte: new Date('2026-03-01') } }],
              },
            },
          }),
        );
      });
    });

    it('no busca solapamientos si la convocatoria queda sin fecha de salida', async () => {
      const r = await service.procesarCarga(
        await libro([['Congo', '', 'ORD-1', '', '', '', '11111111', '']]),
      );

      expect(r).toMatchObject({ exitosos: 1, errores: 0 });
      expect(prisma.funcionarios_convocatorias.findMany).not.toHaveBeenCalled();
    });
  });
});

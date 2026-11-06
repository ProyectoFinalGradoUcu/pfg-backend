import { Workbook } from 'exceljs';
import { PersonasCargaService } from './personas-carga.service';

const makeBase = (overrides: Partial<any> = {}) => ({
  id: 30n,
  codigo: 'BAI',
  denominacion: 'B.A.I.',
  unidad_id: 4n,
  unidades: { denominacion: 'C.A.O.' },
  vigente: true,
  ...overrides,
});

const makePrismaMock = () => ({
  regimenes: { findMany: jest.fn().mockResolvedValue([{ id: 1n, numero_ley: '19775', denominacion: 'Militar' }]) },
  sub_unidades: {
    findMany: jest.fn().mockResolvedValue([
      makeBase(),
      makeBase({ id: 31n, codigo: 'ETA', denominacion: 'E.T.A.', unidad_id: 5n, unidades: { denominacion: 'C.G.' } }),
    ]),
  },
  programas: { findMany: jest.fn().mockResolvedValue([{ id: 2n, codigo: 'P01', denominacion: 'Programa 001' }]) },
  situaciones: { findMany: jest.fn().mockResolvedValue([{ id: 3n, codigo: 'ACT', denominacion: 'Actividad' }]) },
  escalafones: { findMany: jest.fn().mockResolvedValue([{ id: 13n, codigo: 'CA', denominacion: 'Comando y Aire' }]) },
  grados: {
    findMany: jest.fn().mockResolvedValue([
      { id: 6n, codigo: 'SGTO', denominacion: 'Sargento', es_oficial: false, es_subalterno: true },
    ]),
  },
});

const ENCABEZADOS = [
  'Cédula *', 'Primer nombre *', 'Primer apellido *', 'Tipo de personal *', 'Régimen', 'Base',
  'Programa', 'Situación', 'Escalafón', 'Grado', 'Fecha de ingreso', 'Familiares',
];

const filaMilitar = (cedula: string, base: string) => [
  cedula, 'Juan', 'Pérez', 'Subalterno', 'Militar', base,
  'Programa 001', 'Actividad', 'Comando y Aire', 'Sargento', '2015-03-01', '',
];

async function libro(filas: unknown[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Personal');
  ws.addRow(ENCABEZADOS);
  filas.forEach((f) => ws.addRow(f));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('PersonasCargaService', () => {
  let service: PersonasCargaService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let subalternos: { createPersonal: jest.Mock };
  let derecha: { asignarEnAltaLote: jest.Mock };

  beforeEach(() => {
    prisma = makePrismaMock();
    let siguienteId = 100;
    subalternos = { createPersonal: jest.fn().mockImplementation(() => Promise.resolve({ id: siguienteId++ })) };
    derecha = { asignarEnAltaLote: jest.fn().mockResolvedValue(undefined) };
    service = new PersonasCargaService(prisma as any, subalternos as any, derecha as any);
  });

  describe('generarPlantilla', () => {
    it('tiene la columna Base y ya no Unidad ni Sub-unidad', async () => {
      const wb = new Workbook();
      await wb.xlsx.load((await service.generarPlantilla()) as any);

      const titulos: string[] = [];
      wb.getWorksheet('Personal')!.getRow(1).eachCell((c) => titulos.push(String(c.value).replace(' *', '')));

      expect(titulos).toContain('Base');
      expect(titulos).not.toContain('Unidad');
      expect(titulos).not.toContain('Sub-unidad');
    });

    it('la lista de bases muestra la base con su comando', async () => {
      const wb = new Workbook();
      await wb.xlsx.load((await service.generarPlantilla()) as any);

      const valores: string[] = [];
      wb.getWorksheet('Listas')!.eachRow((row) => row.eachCell((c) => valores.push(String(c.value))));

      expect(valores).toEqual(expect.arrayContaining(['BAI — B.A.I. (C.A.O.)', 'ETA — E.T.A. (C.G.)']));
    });
  });

  describe('procesarCarga', () => {
    it('una fila militar se da de alta con la base y el comando de esa base', async () => {
      const r = await service.procesarCarga(await libro([filaMilitar('11111111', 'B.A.I. (C.A.O.)')]));

      expect(r).toMatchObject({ total: 1, exitosos: 1, errores: 0 });
      const [dto, alcance, usuario, opciones] = subalternos.createPersonal.mock.calls[0];
      expect(dto).toMatchObject({ es_civil: false, sub_unidad_id: 30, unidad_id: 4, grado_id: 6 });
      expect(dto).not.toHaveProperty('unidad');
      expect(alcance).toBeUndefined();
      expect(usuario).toBeUndefined();
      expect(opciones).toEqual({ omitirDerecha: true });
    });

    it('también resuelve la base por su etiqueta completa', async () => {
      await service.procesarCarga(await libro([filaMilitar('11111111', 'ETA — E.T.A. (C.G.)')]));

      expect(subalternos.createPersonal.mock.calls[0][0]).toMatchObject({ sub_unidad_id: 31, unidad_id: 5 });
    });

    it('una fila sin base queda con error y el resto se carga igual', async () => {
      const r = await service.procesarCarga(
        await libro([filaMilitar('11111111', ''), filaMilitar('22222222', 'B.A.I. (C.A.O.)')]),
      );

      expect(r).toMatchObject({ total: 2, exitosos: 1, errores: 1 });
      expect(r.resultados[0]).toMatchObject({
        fila: 2,
        cedula: '11111111',
        estado: 'error',
        mensaje: expect.stringContaining('Faltan datos militares: Base.'),
      });
      expect(r.resultados[1]).toMatchObject({ fila: 3, estado: 'ok' });
      expect(subalternos.createPersonal).toHaveBeenCalledTimes(1);
      expect(subalternos.createPersonal.mock.calls[0][0].cedula).toBe('22222222');
      expect(derecha.asignarEnAltaLote).toHaveBeenCalledWith([100n]);
    });

    it('una base que no está en la lista se rechaza en esa fila', async () => {
      const r = await service.procesarCarga(await libro([filaMilitar('11111111', 'B.A.II. (C.A.O.)')]));

      expect(r.resultados[0]).toMatchObject({ estado: 'error', mensaje: expect.stringContaining('"Base"') });
      expect(subalternos.createPersonal).not.toHaveBeenCalled();
    });

    it('con alcance de unidad el catálogo solo trae las bases del usuario', async () => {
      const alcance: any = { tipo: 'unidad', subUnidadIds: ['30'], comandoIds: ['4'] };
      prisma.sub_unidades.findMany.mockResolvedValue([makeBase()]);

      await service.procesarCarga(await libro([filaMilitar('11111111', 'B.A.I. (C.A.O.)')]), alcance);

      expect(prisma.sub_unidades.findMany.mock.calls[0][0].where).toEqual({ vigente: true, id: { in: [30n] } });
      expect(subalternos.createPersonal.mock.calls[0][1]).toBe(alcance);
    });

    it('sin alcance no filtra las bases', async () => {
      await service.generarPlantilla();

      expect(prisma.sub_unidades.findMany.mock.calls[0][0].where).toEqual({ vigente: true });
    });

    it('un civil no necesita base y se le leen los familiares', async () => {
      const civil = ['33333333', 'Ana', 'Ruiz', 'Civil', '', '', '', '', '', '', '', '11111111:Cónyuge'];

      const r = await service.procesarCarga(await libro([civil, filaMilitar('11111111', 'B.A.I. (C.A.O.)')]));

      expect(r).toMatchObject({ exitosos: 2, errores: 0 });
      // Los militares se cargan antes, así el civil encuentra a su familiar.
      const dtoCivil = subalternos.createPersonal.mock.calls[1][0];
      expect(dtoCivil).toMatchObject({
        cedula: '33333333',
        es_civil: true,
        familiares: [{ cedula: '11111111', tipo_relacion: 'Cónyuge' }],
      });
      expect(dtoCivil).not.toHaveProperty('sub_unidad_id');
      expect(dtoCivil).not.toHaveProperty('unidad_id');
    });
  });
});

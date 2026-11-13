import { Workbook } from 'exceljs';
import { CursosCargaService } from './cursos-carga.service';

describe('Carga de cursos: conservar inscripción y baja', () => {
  const anterior = { id: 3n, fecha_inicio: new Date('2025-01-01'), fecha_fin: new Date('2025-06-30'), dado_de_baja: false };
  let prisma: any;
  beforeEach(() => {
    prisma = {
      cursos: { findMany: jest.fn().mockResolvedValue([{ id: 1n, nombre_curso: 'Aviación' }]) },
      personas: { findMany: jest.fn().mockResolvedValue([{ id: 10n, cedula: '12345678', es_civil: false, primer_nombre: 'Ana', primer_apellido: 'Pérez' }]) },
      funcionarios_cursos: {
        findUnique: jest.fn().mockResolvedValue(anterior),
        update: jest.fn().mockResolvedValue(anterior), create: jest.fn().mockResolvedValue(anterior),
      },
      $queryRaw: jest.fn(), $transaction: jest.fn().mockImplementation(fn => fn(prisma)),
    };
  });
  async function cargar(inicio = '2025-01-01', fin = '2025-06-30') {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Historial de cursos');
    ws.addRow(['Cédula', 'Curso', 'Resultado', 'Fecha de inicio', 'Fecha de fin']);
    ws.addRow(['12345678', 'Aviación', 'Aprobado', inicio, fin]);
    return new CursosCargaService(prisma).procesarCarga(Buffer.from(await wb.xlsx.writeBuffer()));
  }
  it('no reactiva ni califica una inscripción dada de baja', async () => {
    prisma.funcionarios_cursos.findUnique.mockResolvedValue({ ...anterior, dado_de_baja: true });
    const resultado = await cargar();
    expect(JSON.stringify(resultado)).toContain('dada de baja');
    expect(prisma.funcionarios_cursos.update).not.toHaveBeenCalled();
  });
  it('rechaza otra instancia con fechas distintas sin sobrescribir historial', async () => {
    const resultado = await cargar('2026-01-01', '2026-06-30');
    expect(JSON.stringify(resultado)).toContain('otra instancia');
    expect(prisma.funcionarios_cursos.update).not.toHaveBeenCalled();
  });
  it('permite cargar resultados de la misma instancia sin modificar la baja', async () => {
    await cargar();
    expect(prisma.funcionarios_cursos.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 3n }, data: expect.objectContaining({ aprobado: true }),
    }));
    expect(prisma.funcionarios_cursos.update.mock.calls[0][0].data).not.toHaveProperty('dado_de_baja');
  });
});

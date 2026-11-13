import { Workbook } from 'exceljs';
import { MisionesCargaService } from './misiones-carga.service';

describe('Misiones: validaciones de carga Excel', () => {
  it('rechaza un participante solapado sin insertar la asignación', async () => {
    const convocatoria = { id: 10n, mision_id: 1n, numero_orden: 'O-1', boletin: null, fecha_salida: new Date('2026-01-01'), fecha_llegada: new Date('2026-06-30') };
    const tx: any = {
      $executeRaw: jest.fn(),
      misiones: { findMany: jest.fn().mockResolvedValue([{ id: 1n, nombre_mision: 'Congo', pais: 'Congo' }]), findFirst: jest.fn().mockResolvedValue({ id: 1n, nombre_mision: 'Congo' }) },
      convocatorias: { findFirst: jest.fn().mockResolvedValue(convocatoria) },
      personas: { findMany: jest.fn().mockResolvedValue([{ id: 3n, cedula: '12345678', primer_nombre: 'Ana', primer_apellido: 'Pérez', es_civil: false }]) },
      funcionarios_convocatorias: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ persona_id: 3n, convocatoria_id: 20n }), create: jest.fn() },
      $transaction: jest.fn().mockImplementation(fn => fn(tx)),
    };
    const wb = new Workbook();
    const ws = wb.addWorksheet('Participantes');
    ws.addRow(['Cédula', 'Misión', 'N.º de orden de la convocatoria', 'Fecha de salida', 'Fecha de llegada']);
    ws.addRow(['12345678', 'Congo', 'O-1', '2026-01-01', '2026-06-30']);
    const resultado = await new MisionesCargaService(tx).procesarCarga(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(JSON.stringify(resultado)).toContain('solapadas');
    expect(tx.funcionarios_convocatorias.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
});

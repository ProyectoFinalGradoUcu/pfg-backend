import { misionesFuente } from './custom/misiones.fuente';
import { misionesOficialesReporte } from './definiciones/misiones-oficiales.reporte';
import { wherePersonaPorCategoria } from '../../lib/personal/categoria-personal';

const makeParticipacion = () => ({
  id: 1n,
  persona_id: 71n,
  numero_orden: 'ORD-PERSONA',
  boletin: 'BOL-PERSONA',
  personas: {
    cedula: '12345678', primer_nombre: 'Ana', segundo_nombre: null,
    primer_apellido: 'Pérez', segundo_apellido: null,
    relaciones_laborales: [{ grados: { denominacion: 'Capitán' } }],
  },
  convocatorias: {
    id: 10n, numero_orden: 'ORD-CONVOCATORIA', boletin: 'BOL-CONVOCATORIA',
    fecha_salida: new Date('2026-03-01'), fecha_llegada: new Date('2026-09-30'),
    misiones: {
      nombre_mision: 'Congo (MONUSCO)', tipo_mision: 'Nombre anterior', pais: 'Congo',
      numero_orden: 'ORD-MISION', boletin: 'BOL-MISION',
      fecha_salida: new Date('2000-01-01'), fecha_llegada: new Date('2000-12-31'),
      fecha_orden: new Date('2026-01-15'), fecha_boletin: new Date('2026-01-16'),
      numero_resolucion: 'RES-1', fecha_resolucion: new Date('2026-01-17'), resolucion_cje: 'CJE-1',
    },
  },
});

describe('Reportes de misiones (SCRUM-165)', () => {
  const prisma: any = {
    funcionarios_convocatorias: { findMany: jest.fn() },
    funcionarios_misiones: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.funcionarios_convocatorias.findMany.mockResolvedValue([makeParticipacion()]);
  });

  it('el reporte fijo lee solo participaciones actuales y usa fechas de convocatoria y nombre de misión', async () => {
    const result = await misionesOficialesReporte.ejecutar({ prisma, filtros: {} });
    expect(result.filas).toEqual([{
      cedula: '12345678', apellido: 'Pérez', nombre: 'Ana', grado: 'Capitán',
      pais: 'Congo', mision: 'Congo (MONUSCO)', boletin: 'BOL-PERSONA',
      numero_orden: 'ORD-PERSONA', fecha_salida: '01/03/2026', fecha_regreso: '30/09/2026',
      fecha_orden: '15/01/2026', fecha_boletin: '16/01/2026',
      numero_resolucion: 'RES-1', fecha_resolucion: '17/01/2026', resolucion_cje: 'CJE-1',
    }]);
    expect(prisma.funcionarios_misiones.findMany).not.toHaveBeenCalled();
  });

  it('la fuente personalizada y el reporte fijo exponen los mismos campos y datos', async () => {
    const result = await misionesOficialesReporte.ejecutar({ prisma, filtros: {} });
    expect(await misionesFuente.consultar(prisma, {})).toEqual(result.filas);
    expect(misionesFuente.columnas).toEqual(result.columnas);
  });

  it('usa orden y boletín de convocatoria cuando no hay valores por persona', async () => {
    const r: any = makeParticipacion();
    r.numero_orden = null;
    r.boletin = null;
    prisma.funcionarios_convocatorias.findMany.mockResolvedValue([r]);
    const [fila] = await misionesFuente.consultar(prisma, {});
    expect(fila.numero_orden).toBe('ORD-CONVOCATORIA');
    expect(fila.boletin).toBe('BOL-CONVOCATORIA');
  });

  it('usa datos de misión como último respaldo, pero no hereda fechas de viaje', async () => {
    const r: any = makeParticipacion();
    r.numero_orden = r.boletin = null;
    r.convocatorias.numero_orden = r.convocatorias.boletin = null;
    r.convocatorias.fecha_salida = r.convocatorias.fecha_llegada = null;
    r.convocatorias.misiones.nombre_mision = null;
    prisma.funcionarios_convocatorias.findMany.mockResolvedValue([r]);
    const [fila] = await misionesFuente.consultar(prisma, {});
    expect(fila).toMatchObject({
      numero_orden: 'ORD-MISION', boletin: 'BOL-MISION', mision: 'Nombre anterior',
      fecha_salida: '', fecha_regreso: '',
    });
  });

  it('conserva una fila por convocatoria aunque una persona repita misión', async () => {
    const otra = makeParticipacion();
    otra.id = 2n;
    otra.convocatorias.id = 11n;
    prisma.funcionarios_convocatorias.findMany.mockResolvedValue([makeParticipacion(), otra]);
    const result = await misionesOficialesReporte.ejecutar({ prisma, filtros: {} });
    expect(result.filas).toHaveLength(2);
    expect(result.resumen).toEqual([{ etiqueta: 'Total participaciones', valor: 2 }]);
  });

  it('filtra por persona, país y categoría utilizando las relaciones nuevas', async () => {
    await misionesFuente.consultar(prisma, { persona_id: '71', pais: 'con', categoria: 'oficial' });
    expect(prisma.funcionarios_convocatorias.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        persona_id: 71n,
        convocatorias: { misiones: { pais: { contains: 'con', mode: 'insensitive' } } },
        personas: wherePersonaPorCategoria('oficial'),
      },
    }));
  });

  it('devuelve resultado vacío sin consultar legacy cuando no hay participaciones', async () => {
    prisma.funcionarios_convocatorias.findMany.mockResolvedValue([]);
    const result = await misionesOficialesReporte.ejecutar({ prisma, filtros: {} });
    expect(result.filas).toEqual([]);
    expect(prisma.funcionarios_misiones.findMany).not.toHaveBeenCalled();
  });
});

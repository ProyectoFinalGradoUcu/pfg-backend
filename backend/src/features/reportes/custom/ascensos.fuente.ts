import { fmtFecha, unir } from '../definiciones/_helpers';
import { FuenteCustom } from './fuentes.types';

export const ascensosFuente: FuenteCustom = {
  clave: 'ascensos',
  titulo: 'Ascensos',
  columnas: [
    { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
    { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { clave: 'grado_anterior', etiqueta: 'Grado anterior', tipo: 'texto' },
    { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
    { clave: 'fecha_ascenso', etiqueta: 'Fecha de ascenso', tipo: 'fecha' },
    { clave: 'numero_orden', etiqueta: 'N.º de orden', tipo: 'texto' },
    { clave: 'cumplia', etiqueta: 'Cumplía requisitos', tipo: 'texto' },
    { clave: 'motivo_excepcion', etiqueta: 'Motivo de excepción', tipo: 'texto' },
    { clave: 'estado', etiqueta: 'Estado', tipo: 'texto' },
    { clave: 'observaciones', etiqueta: 'Observaciones', tipo: 'texto' },
  ],
  filtros: [
    { clave: 'persona_id', etiqueta: 'Funcionario', tipo: 'select', fuenteOpciones: 'personas' },
  ],

  async consultar(prisma, filtros) {
    const ascensos = await prisma.ascensos.findMany({
      where: {
        ...(filtros.persona_id ? { persona_id: BigInt(filtros.persona_id) } : {}),
      },
      include: { grados: true, grados_grado_anterior: true, personas: true },
      orderBy: { fecha_ascenso: 'desc' },
    });
    return ascensos.map((a) => ({
      cedula: a.personas?.cedula ?? '',
      apellido: unir(a.personas?.primer_apellido, a.personas?.segundo_apellido),
      nombre: unir(a.personas?.primer_nombre, a.personas?.segundo_nombre),
      grado_anterior: a.grados_grado_anterior?.denominacion ?? '',
      grado: a.grados?.denominacion ?? '',
      fecha_ascenso: fmtFecha(a.fecha_ascenso),
      // Las filas viejas tenían el número de orden en observaciones.
      numero_orden: a.numero_orden ?? a.observaciones ?? '',
      cumplia:
        a.cumplia_requisitos === null
          ? 'Sin regla'
          : a.cumplia_requisitos
            ? 'Sí'
            : 'Por excepción',
      motivo_excepcion: a.motivo_excepcion ?? '',
      estado: a.anulado_en ? 'Anulado' : 'Vigente',
      observaciones: a.observaciones ?? '',
    }));
  },
};

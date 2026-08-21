import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';
import { fmtFecha, unir } from './_helpers';

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'escalafon', etiqueta: 'Escalafón', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { clave: 'destino', etiqueta: 'Destino', tipo: 'texto' },
  { clave: 'tipo_destino', etiqueta: 'Tipo', tipo: 'texto' },
  { clave: 'cargo', etiqueta: 'Cargo', tipo: 'texto' },
  { clave: 'fecha_destino', etiqueta: 'Fecha destino', tipo: 'fecha' },
  { clave: 'fecha_fin', etiqueta: 'Fecha fin', tipo: 'fecha' },
  { clave: 'numero_orden', etiqueta: 'N.º Orden', tipo: 'texto' },
];

export const destinosReporte: DefinicionReporte = {
  clave: 'destinos',
  titulo: 'Destinos',
  descripcion: 'Asignaciones de destino del personal, con cargo, fecha y número de orden.',
  categoria: 'Personal',

   

  parametros: [],

  async ejecutar({ prisma }: ContextoEjecucion): Promise<ResultadoReporte> {
    const asignaciones = await prisma.destinos.findMany({
      include: {
        unidades: true,
        personas: {
          include: {
            relaciones_laborales: {
              where: { estado: 'activo' },
              take: 1,
              include: { grados: true, escalafones: true },
            },
          },
        },
      },
      orderBy: { fecha_inicio: 'desc' },
    });

    const filas = asignaciones.map((a) => {
      const rel = a.personas?.relaciones_laborales?.[0];
      return {
        cedula: a.personas?.cedula ?? '',
        grado: rel?.grados?.denominacion ?? '',
        escalafon: rel?.escalafones?.codigo ?? '',
        apellido: unir(a.personas?.primer_apellido, a.personas?.segundo_apellido),
        nombre: unir(a.personas?.primer_nombre, a.personas?.segundo_nombre),
        destino: a.unidades?.denominacion ?? '',
        tipo_destino: a.unidades?.tipo ?? '',
        cargo: a.posicion_destino ?? '',
        fecha_destino: fmtFecha(a.fecha_inicio),
        fecha_fin: fmtFecha(a.fecha_fin),
        numero_orden: a.numero_orden ?? '',
      };
    });

    return {
      columnas: COLUMNAS,
      filas,
      resumen: [{ etiqueta: 'Total destinos', valor: filas.length }],
    };
  },
};

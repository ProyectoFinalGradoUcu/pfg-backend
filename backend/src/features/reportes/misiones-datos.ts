import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service';
import { wherePersonaPorCategoria } from '../../lib/personal/categoria-personal';
import { categoriaDeFiltros, fmtFecha, unir } from './definiciones/_helpers';
import { ColumnaReporte } from './reportes.types';
import { wherePersonaReporte } from './alcance-reportes';

export const COLUMNAS_MISIONES: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'pais', etiqueta: 'País', tipo: 'texto' },
  { clave: 'mision', etiqueta: 'Misión', tipo: 'texto' },
  { clave: 'boletin', etiqueta: 'Boletín', tipo: 'texto' },
  { clave: 'fecha_boletin', etiqueta: 'Fecha boletín', tipo: 'fecha' },
  { clave: 'numero_resolucion', etiqueta: 'N.º Res.', tipo: 'texto' },
  { clave: 'fecha_resolucion', etiqueta: 'Fecha res.', tipo: 'fecha' },
  { clave: 'resolucion_cje', etiqueta: 'Res. CJE', tipo: 'texto' },
  { clave: 'fecha_orden', etiqueta: 'Fecha orden', tipo: 'fecha' },
  { clave: 'fecha_salida', etiqueta: 'Salida', tipo: 'fecha' },
  { clave: 'fecha_regreso', etiqueta: 'Regreso', tipo: 'fecha' },
  { clave: 'numero_orden', etiqueta: 'N.º Orden', tipo: 'texto' },
];

/** Una fila por participación en una convocatoria del modelo actual. */
export async function consultarMisiones(
  prisma: PrismaService,
  filtros: Record<string, string | undefined>,
) {
  const categoria = categoriaDeFiltros(filtros);
  const where: Prisma.funcionarios_convocatoriasWhereInput = {
    ...(filtros.persona_id ? { persona_id: BigInt(filtros.persona_id) } : {}),
    ...(filtros.pais ? {
      convocatorias: { misiones: { pais: { contains: filtros.pais, mode: 'insensitive' } } },
    } : {}),
    personas: { ...wherePersonaReporte(filtros), ...(categoria && wherePersonaPorCategoria(categoria)) },
  };
  const registros = await prisma.funcionarios_convocatorias.findMany({
    where,
    include: {
      convocatorias: { include: { misiones: true } },
      personas: {
        include: {
          relaciones_laborales: { where: { estado: 'activo' }, take: 1, include: { grados: true } },
        },
      },
    },
  });

  return registros.map((r) => {
    const convocatoria = r.convocatorias;
    const mision = convocatoria.misiones;
    return {
      cedula: r.personas.cedula ?? '',
      apellido: unir(r.personas.primer_apellido, r.personas.segundo_apellido),
      nombre: unir(r.personas.primer_nombre, r.personas.segundo_nombre),
      grado: r.personas.relaciones_laborales[0]?.grados?.denominacion ?? '',
      pais: mision.pais ?? '',
      mision: mision.nombre_mision ?? mision.tipo_mision ?? '',
      boletin: r.boletin ?? convocatoria.boletin ?? mision.boletin ?? '',
      fecha_boletin: fmtFecha(mision.fecha_boletin),
      numero_resolucion: mision.numero_resolucion ?? '',
      fecha_resolucion: fmtFecha(mision.fecha_resolucion),
      resolucion_cje: mision.resolucion_cje ?? '',
      fecha_orden: fmtFecha(mision.fecha_orden),
      fecha_salida: fmtFecha(convocatoria.fecha_salida),
      fecha_regreso: fmtFecha(convocatoria.fecha_llegada),
      numero_orden: r.numero_orden ?? convocatoria.numero_orden ?? mision.numero_orden ?? '',
    };
  });
}

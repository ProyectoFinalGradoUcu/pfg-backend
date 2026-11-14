import { wherePersonaPorCategoria } from '../../../lib/personal/categoria-personal';
import { categoriaDeFiltros, fmtFecha, PARAMETRO_CATEGORIA, unir } from '../definiciones/_helpers';
import { FuenteCustom } from './fuentes.types';
import { wherePersonaReporte } from '../alcance-reportes';

export const destinosFuente: FuenteCustom = {
  clave: 'destinos',
  titulo: 'Destinos',
  columnas: [
    { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
    { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
    { clave: 'destino', etiqueta: 'Destino', tipo: 'texto' },
    { clave: 'comando', etiqueta: 'Comando', tipo: 'texto' },
    { clave: 'cargo', etiqueta: 'Cargo', tipo: 'texto' },
    { clave: 'fecha_destino', etiqueta: 'Fecha destino', tipo: 'fecha' },
    { clave: 'fecha_fin', etiqueta: 'Fecha fin', tipo: 'fecha' },
    { clave: 'numero_orden', etiqueta: 'N.º Orden', tipo: 'texto' },
  ],
  filtros: [
    { clave: 'persona_id', etiqueta: 'Funcionario', tipo: 'select', fuenteOpciones: 'personas' },
    PARAMETRO_CATEGORIA,
  ],

  async consultar(prisma, filtros) {
    const categoria = categoriaDeFiltros(filtros);
    const asignaciones = await prisma.destinos.findMany({
      where: {
        ...(filtros.persona_id ? { persona_id: BigInt(filtros.persona_id) } : {}),
        personas: { ...wherePersonaReporte(filtros), ...(categoria && wherePersonaPorCategoria(categoria)) },
      },
      include: {
        unidades: true,
        sub_unidades: true,
        personas: {
          include: {
            relaciones_laborales: { where: { estado: 'activo' }, take: 1, include: { grados: true } },
          },
        },
      },
      orderBy: { fecha_inicio: 'desc' },
    });
    return asignaciones.map((a) => ({
      cedula: a.personas?.cedula ?? '',
      apellido: unir(a.personas?.primer_apellido, a.personas?.segundo_apellido),
      nombre: unir(a.personas?.primer_nombre, a.personas?.segundo_nombre),
      grado: a.personas?.relaciones_laborales?.[0]?.grados?.denominacion ?? '',
      destino: a.sub_unidades?.denominacion ?? '',
      comando: a.unidades?.denominacion ?? '',
      cargo: a.posicion_destino ?? '',
      fecha_destino: fmtFecha(a.fecha_inicio),
      fecha_fin: fmtFecha(a.fecha_fin),
      numero_orden: a.numero_orden ?? '',
    }));
  },
};

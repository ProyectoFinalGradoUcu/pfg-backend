import { fmtFecha, unir } from '../definiciones/_helpers';
import { FuenteCustom } from './fuentes.types';

export const destinosFuente: FuenteCustom = {
  clave: 'destinos',
  titulo: 'Destinos',
  columnas: [
    { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
    { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
    { clave: 'destino', etiqueta: 'Destino', tipo: 'texto' },
    { clave: 'tipo_destino', etiqueta: 'Tipo', tipo: 'texto' },
    { clave: 'cargo', etiqueta: 'Cargo', tipo: 'texto' },
    { clave: 'fecha_destino', etiqueta: 'Fecha destino', tipo: 'fecha' },
    { clave: 'numero_orden', etiqueta: 'N.º Orden', tipo: 'texto' },
  ],
  filtros: [
    { clave: 'persona_id', etiqueta: 'Funcionario', tipo: 'select', fuenteOpciones: 'personas' },
  ],

  async consultar(prisma, filtros) {
    const asignaciones = await prisma.asignaciones_funcionario.findMany({
      where: {
        ...(filtros.persona_id ? { persona_id: BigInt(filtros.persona_id) } : {}),
      },
      include: {
        destinos: true,
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
      destino: a.destinos?.ubicacion ?? '',
      tipo_destino: a.destinos?.tipo_destino ?? '',
      cargo: a.posicion_destino ?? '',
      fecha_destino: fmtFecha(a.fecha_inicio),
      numero_orden: a.destinos?.numero_orden ?? '',
    }));
  },
};

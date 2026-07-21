import { fmtFecha, unir } from '../definiciones/_helpers';
import { FuenteCustom } from './fuentes.types';

export const misionesFuente: FuenteCustom = {
  clave: 'misiones',
  titulo: 'Misiones',
  columnas: [
    { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
    { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
    { clave: 'pais', etiqueta: 'País', tipo: 'texto' },
    { clave: 'mision', etiqueta: 'Misión', tipo: 'texto' },
    { clave: 'boletin', etiqueta: 'Boletín', tipo: 'texto' },
    { clave: 'fecha_salida', etiqueta: 'Salida', tipo: 'fecha' },
    { clave: 'fecha_regreso', etiqueta: 'Regreso', tipo: 'fecha' },
    { clave: 'numero_orden', etiqueta: 'N.º Orden', tipo: 'texto' },
  ],
  filtros: [
    { clave: 'persona_id', etiqueta: 'Funcionario', tipo: 'select', fuenteOpciones: 'personas' },
    { clave: 'pais', etiqueta: 'País', tipo: 'texto' },
  ],

  async consultar(prisma, filtros) {
    const registros = await prisma.funcionarios_misiones.findMany({
      where: {
        ...(filtros.persona_id ? { persona_id: BigInt(filtros.persona_id) } : {}),
        ...(filtros.pais ? { misiones: { pais: { contains: filtros.pais, mode: 'insensitive' } } } : {}),
      },
      include: {
        misiones: true,
        personas: {
          include: {
            relaciones_laborales: { where: { estado: 'activo' }, take: 1, include: { grados: true } },
          },
        },
      },
    });
    return registros.map((r) => ({
      cedula: r.personas?.cedula ?? '',
      apellido: unir(r.personas?.primer_apellido, r.personas?.segundo_apellido),
      nombre: unir(r.personas?.primer_nombre, r.personas?.segundo_nombre),
      grado: r.personas?.relaciones_laborales?.[0]?.grados?.denominacion ?? '',
      pais: r.misiones?.pais ?? '',
      mision: r.misiones?.tipo_mision ?? '',
      boletin: r.boletin ?? r.misiones?.boletin ?? '',
      fecha_salida: fmtFecha(r.misiones?.fecha_salida),
      fecha_regreso: fmtFecha(r.misiones?.fecha_llegada),
      numero_orden: r.misiones?.numero_orden ?? '',
    }));
  },
};

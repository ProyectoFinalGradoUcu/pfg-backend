import { fmtFecha, unir } from '../definiciones/_helpers';
import { FuenteCustom } from './fuentes.types';

export const personalFuente: FuenteCustom = {
  clave: 'personal',
  titulo: 'Personal',
  columnas: [
    { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
    { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
    { clave: 'genero', etiqueta: 'Sexo', tipo: 'texto' },
    { clave: 'fecha_nacimiento', etiqueta: 'Fecha nac.', tipo: 'fecha' },
    { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
    { clave: 'escalafon', etiqueta: 'Escalafón', tipo: 'texto' },
    { clave: 'unidad', etiqueta: 'Unidad', tipo: 'texto' },
    { clave: 'situacion', etiqueta: 'Situación', tipo: 'texto' },
    { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
    { clave: 'email', etiqueta: 'E-mail', tipo: 'texto' },
    { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'texto' },
    { clave: 'departamento', etiqueta: 'Departamento', tipo: 'texto' },
  ],
  filtros: [
    { clave: 'estado', etiqueta: 'Estado', tipo: 'select', opciones: [
      { valor: 'activo', etiqueta: 'Activo' },
      { valor: 'inactivo', etiqueta: 'Inactivo' },
    ] },
    { clave: 'unidad_id', etiqueta: 'Unidad', tipo: 'select', fuenteOpciones: 'unidades' },
  ],

  async consultar(prisma, filtros) {
    const rels = await prisma.relaciones_laborales.findMany({
      where: {
        ...(filtros.estado ? { estado: filtros.estado } : {}),
        ...(filtros.unidad_id ? { unidad_id: BigInt(filtros.unidad_id) } : {}),
      },
      include: {
        personas: true,
        grados: true,
        escalafones: true,
        unidades: true,
        situaciones: true,
        regimenes: true,
      },
      orderBy: { grados: { orden: 'asc' } },
    });
    return rels.map((r) => ({
      cedula: r.personas?.cedula ?? '',
      apellido: unir(r.personas?.primer_apellido, r.personas?.segundo_apellido),
      nombre: unir(r.personas?.primer_nombre, r.personas?.segundo_nombre),
      genero: r.personas?.genero ?? '',
      fecha_nacimiento: fmtFecha(r.personas?.fecha_nacimiento),
      grado: r.grados?.denominacion ?? '',
      escalafon: r.escalafones?.codigo ?? '',
      unidad: r.unidades?.denominacion ?? '',
      situacion: r.situaciones?.denominacion ?? '',
      ley: r.regimenes?.numero_ley ?? '',
      email: r.personas?.email ?? '',
      telefono: r.personas?.telefono ?? '',
      departamento: r.personas?.departamento ?? '',
    }));
  },
};

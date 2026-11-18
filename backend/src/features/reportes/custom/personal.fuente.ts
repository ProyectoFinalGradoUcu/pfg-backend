import { whereRelacionPorBase } from '../alcance-reportes';
import { categoriaDeFiltros, fmtFecha, PARAMETRO_BASE, PARAMETRO_CATEGORIA, unir } from '../definiciones/_helpers';
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
    { clave: 'base', etiqueta: 'Base', tipo: 'texto' },
    { clave: 'comando', etiqueta: 'Comando', tipo: 'texto' },
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
    { clave: PARAMETRO_BASE.clave, etiqueta: PARAMETRO_BASE.etiqueta, tipo: 'select', fuenteOpciones: PARAMETRO_BASE.fuenteOpciones },
    PARAMETRO_CATEGORIA,
  ],

  async consultar(prisma, filtros) {
    const categoria = categoriaDeFiltros(filtros);
    const rels = await prisma.relaciones_laborales.findMany({
      where: {
        ...(filtros.estado ? { estado: filtros.estado } : {}),
        ...whereRelacionPorBase(filtros),
        ...(categoria ? { tipo_funcionario: categoria } : {}),
      },
      include: {
        personas: true,
        grados: true,
        escalafones: true,
        unidades: true,
        sub_unidades: true,
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
      base: r.sub_unidades?.denominacion ?? '',
      comando: r.unidades?.denominacion ?? '',
      situacion: r.situaciones?.denominacion ?? '',
      ley: r.regimenes?.numero_ley ?? '',
      email: r.personas?.email ?? '',
      telefono: r.personas?.telefono ?? '',
      departamento: r.personas?.departamento ?? '',
    }));
  },
};

import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
  SeccionReporte,
} from '../reportes.types';
import { campo, COLUMNAS_CAMPO_VALOR, fmtFecha, unir } from './_helpers';

const COL_ASCENSOS: ColumnaReporte[] = [
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'fecha', etiqueta: 'Fecha de ascenso', tipo: 'fecha' },
];

const COL_CURSOS: ColumnaReporte[] = [
  { clave: 'curso', etiqueta: 'Curso', tipo: 'texto' },
  { clave: 'inicio', etiqueta: 'Inicio', tipo: 'fecha' },
  { clave: 'fin', etiqueta: 'Fin', tipo: 'fecha' },
];

export const legajoOficialReporte: DefinicionReporte = {
  clave: 'legajo-oficial',
  titulo: 'Legajo / Ficha del Oficial',
  descripcion: 'Ficha completa del funcionario, con datos, destino, ingreso/egreso, cursos e historial de ascensos.',
  categoria: 'Personal',

   

  parametros: [
    {
      clave: 'persona_id',
      etiqueta: 'Funcionario',
      tipo: 'select',
      fuenteOpciones: 'personas',
      requerido: true,
    },
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    if (!filtros.persona_id) return { secciones: [] };

    const p = await prisma.personas.findUnique({
      where: { id: BigInt(filtros.persona_id) },
      include: {
        relaciones_laborales: {
          orderBy: { fecha_inicio: 'asc' },
          include: { grados: true, escalafones: true, unidades: true },
        },
        destinos: {
          orderBy: { fecha_inicio: 'desc' },
          include: { unidades: true },
        },
        ascensos: { orderBy: { fecha_ascenso: 'asc' }, include: { grados: true } },
        funcionarios_cursos: { orderBy: { fecha_inicio: 'asc' }, include: { cursos: true } },
      },
    });
    if (!p) return { secciones: [] };

    const rels = p.relaciones_laborales;
    const activa = rels.find((r) => r.estado === 'activo') ?? rels[rels.length - 1];
    const ingreso = rels[0]?.fecha_inicio ?? null;
    const egreso = activa?.fecha_fin ?? rels[rels.length - 1]?.fecha_fin ?? null;
    const asignacion = p.destinos[0];

    const datos: SeccionReporte = {
      titulo: 'Datos del funcionario',
      columnas: COLUMNAS_CAMPO_VALOR,
      filas: [
        campo('Apellido y nombre', unir(p.primer_apellido, p.segundo_apellido) + ', ' + unir(p.primer_nombre, p.segundo_nombre)),
        campo('Cédula', p.cedula),
        campo('Sexo', p.genero),
        campo('Fecha de nacimiento', fmtFecha(p.fecha_nacimiento)),
        campo('Lugar de nacimiento', p.lugar_nacimiento),
        campo('Dirección', p.direccion),
        campo('Teléfono', p.telefono),
        campo('Correo electrónico', p.email),
        campo('Escalafón', activa?.escalafones?.denominacion),
        campo('Grado actual', activa?.grados?.denominacion),
        campo('Destino actual', asignacion?.unidades?.denominacion ?? activa?.unidades?.denominacion),
        campo('Cargo actual', asignacion?.posicion_destino),
        campo('Año de ingreso', fmtFecha(ingreso)),
        campo('Fecha de egreso', fmtFecha(egreso)),
        campo('Fecha de último ascenso', fmtFecha(activa?.fecha_ultimo_ascenso)),
      ],
    };

    const ascensos: SeccionReporte = {
      titulo: 'Historial de ascensos',
      columnas: COL_ASCENSOS,
      filas: p.ascensos.map((a) => ({
        grado: a.grados?.denominacion ?? '',
        fecha: fmtFecha(a.fecha_ascenso),
      })),
    };

    const cursos: SeccionReporte = {
      titulo: 'Cursos',
      columnas: COL_CURSOS,
      filas: p.funcionarios_cursos.map((fc) => ({
        curso: fc.cursos?.nombre_curso ?? '',
        inicio: fmtFecha(fc.fecha_inicio),
        fin: fmtFecha(fc.fecha_fin),
      })),
    };

    return { secciones: [datos, ascensos, cursos] };
  },
};

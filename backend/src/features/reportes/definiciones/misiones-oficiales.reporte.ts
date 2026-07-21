import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';
import { fmtFecha, unir } from './_helpers';

const COLUMNAS: ColumnaReporte[] = [
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
];

export const misionesOficialesReporte: DefinicionReporte = {
  clave: 'misiones-oficiales',
  titulo: 'Misiones / Oficiales',
  descripcion: 'Historial de misiones del personal, con país, boletín, fechas de salida/regreso y orden.',
  categoria: 'Personal',

   

  parametros: [
    {
      clave: 'persona_id',
      etiqueta: 'Funcionario',
      tipo: 'select',
      fuenteOpciones: 'personas',
      ayuda: 'Opcional. Vacío = todas las misiones de todo el personal.',
    },
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    const personaId = filtros.persona_id ? BigInt(filtros.persona_id) : undefined;

    const registros = await prisma.funcionarios_misiones.findMany({
      where: personaId ? { persona_id: personaId } : {},
      include: {
        misiones: true,
        personas: {
          include: {
            relaciones_laborales: {
              where: { estado: 'activo' },
              take: 1,
              include: { grados: true },
            },
          },
        },
      },
    });

    const filas = registros.map((r) => {
      const rel = r.personas?.relaciones_laborales?.[0];
      return {
        cedula: r.personas?.cedula ?? '',
        apellido: unir(r.personas?.primer_apellido, r.personas?.segundo_apellido),
        nombre: unir(r.personas?.primer_nombre, r.personas?.segundo_nombre),
        grado: rel?.grados?.denominacion ?? '',
        pais: r.misiones?.pais ?? '',
        mision: r.misiones?.tipo_mision ?? '',
        boletin: r.boletin ?? r.misiones?.boletin ?? '',
        fecha_salida: fmtFecha(r.misiones?.fecha_salida),
        fecha_regreso: fmtFecha(r.misiones?.fecha_llegada),
        numero_orden: r.misiones?.numero_orden ?? '',
      };
    });

    return {
      columnas: COLUMNAS,
      filas,
      resumen: [{ etiqueta: 'Total misiones', valor: filas.length }],
    };
  },
};

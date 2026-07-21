import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
} from '../reportes.types';

const COLUMNAS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'Cédula', tipo: 'texto' },
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'escalafon', etiqueta: 'Escalafón', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellido', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { clave: 'unidad', etiqueta: 'Unidad', tipo: 'texto' },
  { clave: 'prima', etiqueta: 'Prima Técnica', tipo: 'texto' },
  { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
];

function nombreCompleto(p1: string, p2: string | null | undefined): string {
  return [p1, p2].filter(Boolean).join(' ');
}

export const primaTecnicaReporte: DefinicionReporte = {
  clave: 'prima-tecnica',
  titulo: 'Prima Técnica – Personal asignado',
  descripcion:
    'Listado del personal con Prima Técnica asignada, con grado, escalafón, unidad y régimen (Ley Nueva/Vieja).',
  categoria: 'Remuneraciones',
  parametros: [
    {
      clave: 'prima',
      etiqueta: 'Categoría de Prima',
      tipo: 'select',
      opciones: [
        { valor: 'A', etiqueta: 'A' },
        { valor: 'B', etiqueta: 'B' },
        { valor: 'C', etiqueta: 'C' },
      ],
      ayuda: 'Opcional. Vacío = todas las categorías asignadas.',
    },
    {
      clave: 'unidad_id',
      etiqueta: 'Unidad',
      tipo: 'select',
      fuenteOpciones: 'unidades',
    },
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    const unidadId = filtros.unidad_id ? BigInt(filtros.unidad_id) : undefined;
    const prima = filtros.prima?.trim().toUpperCase();

    const relaciones = await prisma.relaciones_laborales.findMany({
      where: {
        estado: 'activo',
        ...(unidadId ? { unidad_id: unidadId } : {}),
        ...(prima
          ? { prima_tecnica: prima }
          : { prima_tecnica: { notIn: ['VACIO'], not: null } }),
      },
      select: {
        prima_tecnica: true,
        personas: {
          select: {
            cedula: true,
            primer_nombre: true,
            segundo_nombre: true,
            primer_apellido: true,
            segundo_apellido: true,
          },
        },
        grados: { select: { denominacion: true, orden: true } },
        escalafones: { select: { codigo: true, denominacion: true } },
        unidades: { select: { denominacion: true } },
        regimenes: { select: { es_ley_vieja: true } },
      },
    });

    const filas = relaciones
      .map((rel) => ({
        cedula: rel.personas?.cedula ?? '',
        grado: rel.grados?.denominacion ?? '',
        escalafon: rel.escalafones?.codigo ?? rel.escalafones?.denominacion ?? '',
        apellido: nombreCompleto(rel.personas?.primer_apellido ?? '', rel.personas?.segundo_apellido),
        nombre: nombreCompleto(rel.personas?.primer_nombre ?? '', rel.personas?.segundo_nombre),
        unidad: rel.unidades?.denominacion ?? '',
        prima: rel.prima_tecnica ?? '',
        ley: rel.regimenes?.es_ley_vieja ? 'Vieja' : 'Nueva',
        _orden: rel.grados?.orden ?? 999,
      }))
      .sort((a, b) => a._orden - b._orden || a.apellido.localeCompare(b.apellido))
      .map(({ _orden, ...fila }) => fila);

    return {
      columnas: COLUMNAS,
      filas,
      resumen: [{ etiqueta: 'Total asignaciones', valor: filas.length }],
    };
  },
};

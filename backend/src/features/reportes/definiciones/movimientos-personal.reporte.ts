import {
  ColumnaReporte,
  ContextoEjecucion,
  DefinicionReporte,
  ResultadoReporte,
  SeccionReporte,
} from '../reportes.types';
import { fmtFecha, unir } from './_helpers';

const COL_ALTAS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'C.I.', tipo: 'texto' },
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombres', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellidos', tipo: 'texto' },
  { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
  { clave: 'causal', etiqueta: 'Causal', tipo: 'texto' },
  { clave: 'unidad', etiqueta: 'Unidad', tipo: 'texto' },
  { clave: 'correo', etiqueta: 'Correo', tipo: 'texto' },
  { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
];

const COL_ASCENSOS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'C.I.', tipo: 'texto' },
  { clave: 'grado_viejo', etiqueta: 'Grado viejo', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombres', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellidos', tipo: 'texto' },
  { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
  { clave: 'grado_nuevo', etiqueta: 'Grado nuevo', tipo: 'texto' },
  { clave: 'orden', etiqueta: 'Orden', tipo: 'texto' },
  { clave: 'unidad', etiqueta: 'Unidad', tipo: 'texto' },
  { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
];

const COL_BAJAS_RETIROS: ColumnaReporte[] = [
  { clave: 'cedula', etiqueta: 'C.I.', tipo: 'texto' },
  { clave: 'grado', etiqueta: 'Grado', tipo: 'texto' },
  { clave: 'nombre', etiqueta: 'Nombres', tipo: 'texto' },
  { clave: 'apellido', etiqueta: 'Apellidos', tipo: 'texto' },
  { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
  { clave: 'causal', etiqueta: 'Causal', tipo: 'texto' },
  { clave: 'unidad', etiqueta: 'Unidad', tipo: 'texto' },
  { clave: 'ley', etiqueta: 'Ley', tipo: 'texto' },
];

function rangoFecha(desde?: string, hasta?: string) {
  const filtro: { gte?: Date; lte?: Date } = {};
  if (desde) filtro.gte = new Date(desde);
  if (hasta) filtro.lte = new Date(hasta);
  return Object.keys(filtro).length ? filtro : undefined;
}

export const movimientosPersonalReporte: DefinicionReporte = {
  clave: 'movimientos-personal',
  titulo: 'Altas, Ascensos, Bajas y Retiros',
  descripcion:
    'Novedades de personal por período: altas por ingreso, ascensos, bajas y retiros.',
  categoria: 'Personal',

   

  parametros: [
    { clave: 'desde', etiqueta: 'Desde', tipo: 'fecha', ayuda: 'Opcional.' },
    { clave: 'hasta', etiqueta: 'Hasta', tipo: 'fecha', ayuda: 'Opcional.' },
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    const rango = rangoFecha(filtros.desde, filtros.hasta);

    const altasRaw = await prisma.movimientos_laborales.findMany({
      where: {
        tipos_movimiento: { es_alta: true },
        ...(rango ? { fecha_movimiento: rango } : {}),
      },
      include: {
        tipos_movimiento: true,
        relaciones_laborales: {
          include: { personas: true, grados: true, unidades: true, regimenes: true },
        },
      },
      orderBy: { fecha_movimiento: 'desc' },
    });
    const altas = altasRaw.map((m) => {
      const rel = m.relaciones_laborales;
      return {
        cedula: rel?.personas?.cedula ?? '',
        grado: rel?.grados?.denominacion ?? '',
        nombre: unir(rel?.personas?.primer_nombre, rel?.personas?.segundo_nombre),
        apellido: unir(rel?.personas?.primer_apellido, rel?.personas?.segundo_apellido),
        fecha: fmtFecha(m.fecha_movimiento),
        causal: m.observaciones ?? m.tipos_movimiento?.nombre ?? '',
        unidad: rel?.unidades?.denominacion ?? '',
        correo: rel?.personas?.email ?? '',
        ley: rel?.regimenes?.numero_ley ?? '',
      };
    });

    const ascRaw = await prisma.ascensos.findMany({
      where: rango ? { fecha_ascenso: rango } : {},
      include: {
        grados: true,
        personas: {
          include: {
            relaciones_laborales: {
              where: { estado: 'activo' },
              take: 1,
              include: { unidades: true, regimenes: true },
            },
          },
        },
      },
      orderBy: [{ persona_id: 'asc' }, { fecha_ascenso: 'asc' }],
    });
    // grado viejo = grado del ascenso previo de la misma persona (dentro del set)
    const gradoPrevio = new Map<string, string>();
    const ascensos = ascRaw.map((a) => {
      const rel = a.personas?.relaciones_laborales?.[0];
      const claveP = a.persona_id?.toString() ?? '';
      const gradoViejo = gradoPrevio.get(claveP) ?? '';
      gradoPrevio.set(claveP, a.grados?.denominacion ?? '');
      return {
        cedula: a.personas?.cedula ?? '',
        grado_viejo: gradoViejo,
        nombre: unir(a.personas?.primer_nombre, a.personas?.segundo_nombre),
        apellido: unir(a.personas?.primer_apellido, a.personas?.segundo_apellido),
        fecha: fmtFecha(a.fecha_ascenso),
        grado_nuevo: a.grados?.denominacion ?? '',
        orden: a.observaciones ?? '',
        unidad: rel?.unidades?.denominacion ?? '',
        ley: rel?.regimenes?.numero_ley ?? '',
      };
    });

    const bajasRaw = await prisma.relaciones_laborales.findMany({
      where: {
        motivo_baja_id: { not: null },
        ...(rango ? { fecha_fin: rango } : {}),
      },
      include: {
        personas: true,
        grados: true,
        unidades: true,
        regimenes: true,
        motivos_baja: true,
      },
      orderBy: { fecha_fin: 'desc' },
    });
    const bajas = bajasRaw.map((rl) => ({
      cedula: rl.personas?.cedula ?? '',
      grado: rl.grados?.denominacion ?? '',
      nombre: unir(rl.personas?.primer_nombre, rl.personas?.segundo_nombre),
      apellido: unir(rl.personas?.primer_apellido, rl.personas?.segundo_apellido),
      fecha: fmtFecha(rl.fecha_fin),
      causal: rl.motivos_baja?.denominacion ?? '',
      unidad: rl.unidades?.denominacion ?? '',
      ley: rl.regimenes?.numero_ley ?? '',
    }));

    const retirosRaw = await prisma.retiros.findMany({
      where: rango ? { fecha_retiro: rango } : {},
      include: {
        personas: {
          include: {
            relaciones_laborales: {
              orderBy: { fecha_inicio: 'desc' },
              take: 1,
              include: { grados: true, unidades: true, regimenes: true },
            },
          },
        },
      },
      orderBy: { fecha_retiro: 'desc' },
    });
    const retiros = retirosRaw.map((r) => {
      const rel = r.personas?.relaciones_laborales?.[0];
      return {
        cedula: r.personas?.cedula ?? '',
        grado: rel?.grados?.denominacion ?? '',
        nombre: unir(r.personas?.primer_nombre, r.personas?.segundo_nombre),
        apellido: unir(r.personas?.primer_apellido, r.personas?.segundo_apellido),
        fecha: fmtFecha(r.fecha_retiro),
        causal: r.motivo ?? '',
        unidad: rel?.unidades?.denominacion ?? '',
        ley: rel?.regimenes?.numero_ley ?? '',
      };
    });

    const secciones: SeccionReporte[] = [
      { titulo: '1 · Altas por ingreso', columnas: COL_ALTAS, filas: altas },
      { titulo: '2 · Ascensos', columnas: COL_ASCENSOS, filas: ascensos },
      { titulo: '3 · Bajas', columnas: COL_BAJAS_RETIROS, filas: bajas },
      { titulo: '4 · Retiros', columnas: COL_BAJAS_RETIROS, filas: retiros },
    ];

    return {
      secciones,
      resumen: [
        { etiqueta: 'Altas', valor: altas.length },
        { etiqueta: 'Ascensos', valor: ascensos.length },
        { etiqueta: 'Bajas', valor: bajas.length },
        { etiqueta: 'Retiros', valor: retiros.length },
      ],
    };
  },
};

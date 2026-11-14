import { Prisma } from '@prisma/client';

type Periodo = { fecha_inicio: Date | null; fecha_fin: Date | null };
type Pertenencia = Periodo & { relaciones_laborales?: Periodo | null };

export const PERSONA_NO_RETIRADA = {
  OR: [{ retiros: { none: { anulado: false } } }, { relaciones_laborales: { some: { fecha_fin: null } } }],
} satisfies Prisma.personasWhereInput;

export function personaPuedeIntegrar(persona: { retiros: { anulado: boolean }[]; relaciones_laborales: { fecha_fin: Date | null }[] }): boolean {
  return !persona.retiros.some(r => !r.anulado) || persona.relaciones_laborales.some(r => r.fecha_fin === null);
}

/** Las columnas DATE se comparan con el día civil de Uruguay, no con la hora del servidor. */
export function hoyComisiones(): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find(p => p.type === tipo)!.value;
  return new Date(`${valor('year')}-${valor('month')}-${valor('day')}T00:00:00Z`);
}

export function periodoPertenencia(a: Pertenencia): Periodo {
  const inicios = [a.fecha_inicio, a.relaciones_laborales?.fecha_inicio].filter((d): d is Date => !!d);
  const fines = [a.fecha_fin, a.relaciones_laborales?.fecha_fin].filter((d): d is Date => !!d);
  return {
    fecha_inicio: inicios.length ? new Date(Math.max(...inicios.map(Number))) : null,
    fecha_fin: fines.length ? new Date(Math.min(...fines.map(Number))) : null,
  };
}

export function pertenenciaActiva(a: Pertenencia, hoy = hoyComisiones()): boolean {
  const p = periodoPertenencia(a);
  return (!p.fecha_inicio || p.fecha_inicio <= hoy) && (!p.fecha_fin || p.fecha_fin >= hoy);
}

export function periodosSolapados(a: Pertenencia, b: Pertenencia): boolean {
  const p = periodoPertenencia(a), q = periodoPertenencia(b);
  return (!p.fecha_fin || !q.fecha_inicio || p.fecha_fin >= q.fecha_inicio)
    && (!q.fecha_fin || !p.fecha_inicio || q.fecha_fin >= p.fecha_inicio);
}

/** Misma regla que el mapeo, también para importadas ligadas a un período laboral. */
export function wherePertenenciaActiva(hoy = hoyComisiones()): Prisma.asignaciones_comisionWhereInput {
  return { AND: [
    { personas: PERSONA_NO_RETIRADA },
    { OR: [{ fecha_inicio: null }, { fecha_inicio: { lte: hoy } }] },
    { OR: [{ fecha_fin: null }, { fecha_fin: { gte: hoy } }] },
    { OR: [{ relacion_laboral_id: null }, { relaciones_laborales: { AND: [
      { fecha_inicio: { lte: hoy } },
      { OR: [{ fecha_fin: null }, { fecha_fin: { gte: hoy } }] },
    ] } }] },
  ] };
}

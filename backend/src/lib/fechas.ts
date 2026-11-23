const ZONA_URUGUAY = 'America/Montevideo';

// Fecha de hoy en Uruguay
export function hoyUruguay(ahora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_URUGUAY, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(ahora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return new Date(`${valor('year')}-${valor('month')}-${valor('day')}T00:00:00Z`);
}

export function anioUruguay(ahora: Date = new Date()): number {
  return hoyUruguay(ahora).getUTCFullYear();
}

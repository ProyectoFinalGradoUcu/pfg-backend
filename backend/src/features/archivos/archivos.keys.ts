import { randomUUID } from 'node:crypto';

const LARGO_MAXIMO_NOMBRE = 100;

const limpiar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^\.+/, '');

export function sanearNombre(nombreOriginal: string): string {
  const base = nombreOriginal.split(/[\\/]/).pop() ?? '';
  const corte = base.lastIndexOf('.');
  const cuerpo = corte > 0 ? base.slice(0, corte) : base;
  const extension = corte > 0 ? base.slice(corte + 1) : '';

  const cuerpoLimpio = limpiar(cuerpo).slice(0, LARGO_MAXIMO_NOMBRE) || 'archivo';
  const extensionLimpia = limpiar(extension);

  return extensionLimpia ? `${cuerpoLimpio}.${extensionLimpia}` : cuerpoLimpio;
}

export function construirObjectKey(
  entidad: string,
  entidadId: bigint,
  slot: string,
  nombreOriginal: string,
): string {
  return `${entidad}/${entidadId}/${slot}/${randomUUID()}-${sanearNombre(nombreOriginal)}`;
}

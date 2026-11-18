/**
 * Regla de duplicados de la documentación de un funcionario. Funciones puras: el
 * service trae los documentos activos y acá se decide si el nuevo choca con alguno.
 */

export type MotivoDuplicado = 'contenido' | 'nombre' | 'descripcion';

export interface DocumentoComparable {
  sha256: string;
  nombre_original: string;
  descripcion: string | null;
}

export interface Duplicado<T extends DocumentoComparable> {
  motivo: MotivoDuplicado;
  existente: T;
}

/** Sin acentos, en minúsculas, recortado y con los espacios internos colapsados. */
export const normalizarParaComparar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

/**
 * Devuelve la coincidencia más fuerte: mismo contenido, después mismo nombre,
 * después misma descripción. Una descripción `null` no choca con nada.
 */
export function buscarDuplicado<T extends DocumentoComparable>(
  nuevo: DocumentoComparable,
  existentes: T[],
): Duplicado<T> | null {
  const porContenido = existentes.find((e) => e.sha256 === nuevo.sha256);
  if (porContenido) return { motivo: 'contenido', existente: porContenido };

  const nombre = normalizarParaComparar(nuevo.nombre_original);
  const porNombre = existentes.find(
    (e) => normalizarParaComparar(e.nombre_original) === nombre,
  );
  if (porNombre) return { motivo: 'nombre', existente: porNombre };

  if (nuevo.descripcion === null) return null;
  const porDescripcion = buscarPorDescripcion(nuevo.descripcion, existentes);
  return porDescripcion ? { motivo: 'descripcion', existente: porDescripcion } : null;
}

/** El documento con la misma descripción normalizada, si hay. Los que no tienen no cuentan. */
export function buscarPorDescripcion<T extends DocumentoComparable>(
  descripcion: string,
  existentes: T[],
): T | undefined {
  const buscada = normalizarParaComparar(descripcion);
  return existentes.find(
    (e) => e.descripcion !== null && normalizarParaComparar(e.descripcion) === buscada,
  );
}

export function mensajeDuplicado(
  motivo: MotivoDuplicado,
  existente: DocumentoComparable,
): string {
  switch (motivo) {
    case 'contenido':
      return 'Este archivo ya está cargado para el funcionario';
    case 'nombre':
      return `Ya existe un documento con el nombre «${existente.nombre_original}»`;
    case 'descripcion':
      return `Ya existe un documento con la descripción «${existente.descripcion}»`;
  }
}

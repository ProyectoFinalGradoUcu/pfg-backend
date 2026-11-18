const TILDES: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', n: 'ñ' };

export function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Escapar los comodines de LIKE
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// La palabra sin tilde y con tilde en cada vocal
export function variantesDePalabra(palabra: string): string[] {
  const base = sinTildes(palabra.toLowerCase());
  const variantes = new Set([base]);
  for (let i = 0; i < base.length; i++) {
    const conTilde = TILDES[base[i]];
    if (conTilde) variantes.add(base.slice(0, i) + conTilde + base.slice(i + 1));
  }
  return [...variantes].map(escaparLike);
}

function enCampo(campo: string, condicion: object): object {
  return campo
    .split('.')
    .reverse()
    .reduce<object>((acc, parte) => ({ [parte]: acc }), condicion);
}

// Cada palabra tiene que aparecer en algún campo
export const CAMPOS_PERSONA = ['cedula', 'primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido'];

export function whereBusqueda(texto: string | undefined, campos: string[]): { AND: object[] } | undefined {
  const palabras = texto?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!palabras.length) return undefined;
  return {
    AND: palabras.map((palabra) => ({
      OR: campos.flatMap((campo) =>
        variantesDePalabra(palabra).map((v) => enCampo(campo, { contains: v, mode: 'insensitive' })),
      ),
    })),
  };
}

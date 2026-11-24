import { CAMPOS_SENSIBLES } from './auditoria.constants';

export interface CambioAuditoria {
  campo: string;
  etiqueta?: string;
  anterior: unknown;
  nuevo: unknown;
}

// Normaliza fechas y vacíos para poder comparar
export function normalizarValor(valor: unknown): unknown {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor === 'bigint') return valor.toString();
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const iso = valor.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (typeof valor === 'object' && typeof (valor as { toNumber?: unknown }).toNumber === 'function') {
    return (valor as { toNumber: () => number }).toNumber();
  }
  if (Array.isArray(valor)) {
    const lista = valor.map(normalizarValor);
    // Las listas de texto se comparan sin importar el orden.
    return lista.every((v) => typeof v === 'string') ? [...lista].sort() : lista;
  }
  if (typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor)) salida[clave] = normalizarValor(v);
    return salida;
  }
  return valor;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// Nombre corto de los subcampos que se aplanan: "Calificación de Sgto. Juan Pérez".
const ETIQUETAS_SUBCAMPO: Record<string, string> = {
  calificacion: 'Calificación',
  aprobado: 'Resultado',
  observacion: 'Observación',
};

const etiquetaSubcampo = (campo: string) => {
  const conocida = ETIQUETAS_SUBCAMPO[campo];
  if (conocida) return conocida;
  const texto = campo.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// Los objetos se pasan a texto "clave: valor"
function aEscalar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.some(esObjeto) ? valor.map(aEscalar) : valor;
  if (!esObjeto(valor)) return valor;
  const partes = Object.entries(valor)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${etiquetaSubcampo(k)}: ${String(aEscalar(v))}`);
  return partes.length ? partes.join('; ') : null;
}

// Compara dos fotos planas y devuelve solo los campos que cambiaron.
export function calcularCambios(
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown> | null | undefined,
): CambioAuditoria[] {
  const previo = antes ?? {};
  const actual = despues ?? {};
  const claves = new Set([...Object.keys(previo), ...Object.keys(actual)]);
  const cambios: CambioAuditoria[] = [];
  for (const campo of claves) {
    const anterior = normalizarValor(previo[campo]);
    const nuevo = normalizarValor(actual[campo]);
    if (JSON.stringify(anterior) === JSON.stringify(nuevo)) continue;
    // Si el valor es un objeto va un cambio por subcampo
    if (esObjeto(anterior) || esObjeto(nuevo)) {
      const sub = calcularCambios(esObjeto(anterior) ? anterior : {}, esObjeto(nuevo) ? nuevo : {});
      for (const c of sub) {
        cambios.push({ ...c, etiqueta: `${c.etiqueta ?? etiquetaSubcampo(c.campo)} de ${campo}` });
      }
      continue;
    }
    const sensible = CAMPOS_SENSIBLES.includes(campo);
    cambios.push({
      campo,
      anterior: sensible ? '***' : aEscalar(anterior),
      nuevo: sensible ? '***' : aEscalar(nuevo),
    });
  }
  return cambios;
}

const vacio = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

// Foto para mostrar entera, sin campos vacíos
export function sinVacios(campos: Record<string, unknown>): Record<string, unknown> {
  const normal = normalizarValor(campos);
  if (!esObjeto(normal)) return {};
  return Object.fromEntries(Object.entries(normal).filter(([, v]) => !vacio(v)));
}

// Código de enum a texto: "LICENCIA_SIN_GOCE" → "Licencia sin goce".
export function textoCodigo(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  const texto = codigo.replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

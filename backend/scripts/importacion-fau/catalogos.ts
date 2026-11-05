/**
 * Búsqueda de los valores del Access en los catálogos de la base, con los alias acordados
 * (ver "Decisiones confirmadas con la FAU" en LEEME.md). Lo que falta se anota para crear: unidades,
 * sub-unidades, grados y escalafones son tablas de liquidación, así que solo se crean con
 * --crear-catalogos; unidades_vuelo es nuestra y se crea siempre.
 */
import { PoolClient } from 'pg';
import { clave, texto } from './normalizar.js';

/** id de la base, o la clave de algo que se va a crear ("nuevo:<tabla>:<codigo>"). */
export type Ref = string;

export interface NuevoCatalogo {
  tabla: 'unidades' | 'sub_unidades' | 'grados' | 'escalafones' | 'unidades_vuelo';
  codigo: string;
  denominacion: string;
  vigente: boolean;
  unidad?: Ref; // para sub_unidades
  orden?: number; // para grados
  esSubalterno?: boolean;
}

interface Item {
  id: string;
  codigo: string;
  denominacion: string;
}

// ── Alias ────────────────────────────────────────────────────────────────────

/** clave(valor del Access) → código de grado en la base. */
const GRADOS: Record<string, string> = {
  SDO1: 'SDO_1RA', CBO2: 'CBO_2DA', CBO1: 'CBO_1RA', SGTO: 'SGTO', SGTO1: 'SGTO_1RO', SOM: 'SOM',
  AT2DA: 'AT_2DA', AT2: 'AT_2DA', AT1RA: 'AT_1RA', AT1: 'AT_1RA', ATPPAL: 'AT_PPAL', INSTAT: 'INST_AT',
  SUPVAT: 'SUP_AT', AT3RA: 'AT_3RA',
  ASP: 'CADETE_ASP', CAD1: 'CADETE_1RA', CAD2: 'CADETE_2DA', CAD3: 'CADETE_3RA',
  ALF: 'ALF', TTE2: 'TTE_2DO', TTE1: 'TTE_1RO', CAP: 'CAP', MAY: 'MAY', TTECNEL: 'TTE_CNEL', CNEL: 'CNEL',
  BRIGGRAL: 'BRIG_GRAL', GRALDELAIRE: 'GRAL', GENERALDELAIRE: 'GRAL',
};
const GRADOS_NUEVOS: Record<string, Omit<NuevoCatalogo, 'tabla'>> = {
  AT_3RA: { codigo: 'AT_3RA', denominacion: 'At. 3ª', vigente: true, orden: 19, esSubalterno: false },
};
export const GRADOS_CADETE = new Set(['CADETE_ASP', 'CADETE_1RA', 'CADETE_2DA', 'CADETE_3RA']);
const GRADOS_AEROTECNICO = new Set(['AT_1RA', 'AT_2DA', 'AT_3RA', 'AT_PPAL', 'INST_AT', 'SUP_AT']);

/** clave(valor del Access) → código de escalafón. REIN no es un escalafón: lo resuelve quien llama. */
const ESCALAFONES: Record<string, string> = {
  SG: 'SG', AT: 'AT', ST: 'ST', AV: 'AV', NAV: 'NAV', ADM: 'ADM', RVA: 'RVA', TP: 'TP', PRECTP: 'TP',
  ESP: 'ESP', BFA: 'BM', SA: 'SA',
};
const ESCALAFONES_NUEVOS: Record<string, Omit<NuevoCatalogo, 'tabla'>> = {
  ADM: { codigo: 'ADM', denominacion: '(Adm.)', vigente: false },
  CADETE: { codigo: 'CADETE', denominacion: 'Cadete / Aspirante (sin escalafón)', vigente: true },
  SIN_DATO: { codigo: 'SIN_DATO', denominacion: 'Sin dato (completar a mano)', vigente: true },
};

/** Abreviaturas propias de subalternos → como figura en DESNUM. */
const DESTINOS_ALIAS: Record<string, string> = {
  SMANT: 'Serv.Mant.', SSFA: 'Serv.Sanidad', SCOM: 'Serv.Com.e Infor.', SABAST: 'Serv.Abast.',
  SINFRA: 'Serv.Infraest.', STRANS: 'Serv.Transporte', SMETEO: 'Serv.Met.F.A.', MUSEOAER: 'Museo Aeronáutico',
  SIRFA: 'CIRFA',
};
/** Nombre completo para las unidades que hay que crear, cuando se conoce. */
const DENOMINACIONES: Record<string, string> = {
  BAI: 'Base Aérea Nº 1 (B.A.I)', BAII: 'Base Aérea Nº 2 (B.A.II)', BAIII: 'Base Aérea Nº 3 (B.A.III)',
  EMA: 'Escuela Militar de Aeronáutica (E.M.A.)', ETA: 'Escuela Técnica de Aeronáutica (E.T.A.)',
  ECEMA: 'Escuela de Comando y Estado Mayor Aéreo (E.C.E.M.A.)', COA: 'Comando Aéreo de Operaciones (C.O.A.)',
  DCI: 'Dirección de Comunicación Institucional (D.C.I.)', DSO: 'División de Seguridad Ocupacional (D.S.O.)',
  ESMADE: 'Estado Mayor de la Defensa (ESMADE)', CIRFA: 'Curso de Instrucción al Recluta (CIRFA)',
  BFA: 'Banda de la Fuerza Aérea (B.F.A.)', DIRPERS: 'Dirección de Personal (Dir.Pers.)',
};
/** Unidades que ya no existen pero aparecen en el historial. */
const NO_VIGENTES = new Set(['CIRFA']);

const COMPANIA = /^DIRPERSCA([ABC])$/;

/** Unidades de vuelo: variantes de escritura → clave común. */
function claveUnidadVuelo(v: unknown): string {
  const k = clave(v);
  const m = /^(?:ESCDRON|ESCUADRON|ESC)AERN?O?(\d+)$/.exec(k);
  return m ? `ESCAER${m[1]}` : k;
}

// ── Catálogos ────────────────────────────────────────────────────────────────

export class Catalogos {
  grados = new Map<string, Item>(); // por código
  escalafones = new Map<string, Item>();
  unidades: Item[] = [];
  subUnidades: Array<Item & { unidadId: string }> = [];
  unidadesVuelo: Item[] = [];
  situaciones = new Map<string, string>();
  regimenLeyNueva: string | null = null;
  programa300: string | null = null;
  remunerados = new Set<string>(); // grado_id con remuneración vigente
  /** Lo que habría que crear, por clave Ref. */
  nuevos = new Map<Ref, NuevoCatalogo>();
  /** clave → como figura en DESNUM (lista de unidades vigentes de la FAU), para nombrar las que se crean. */
  desnum = new Map<string, string>();

  usarDesnum(nombres: unknown[]) {
    for (const n of nombres) {
      const t = texto(n);
      if (t && !this.desnum.has(clave(t))) this.desnum.set(clave(t), t);
    }
  }

  static async cargar(db: PoolClient): Promise<Catalogos> {
    const c = new Catalogos();
    const q = async (sql: string) => (await db.query(sql)).rows as Item[];
    for (const g of await q('SELECT id::text, codigo, denominacion FROM grados')) c.grados.set(g.codigo, g);
    for (const e of await q('SELECT id::text, codigo, denominacion FROM escalafones')) c.escalafones.set(e.codigo, e);
    c.unidades = await q('SELECT id::text, codigo, denominacion FROM unidades');
    c.subUnidades = (await db.query(
      'SELECT id::text, codigo, denominacion, unidad_id::text AS "unidadId" FROM sub_unidades',
    )).rows;
    c.unidadesVuelo = await q("SELECT id::text, '' AS codigo, denominacion FROM unidades_vuelo");
    for (const s of await q('SELECT id::text, codigo, denominacion FROM situaciones')) c.situaciones.set(s.codigo, s.id);
    c.regimenLeyNueva = (await db.query("SELECT id::text FROM regimenes WHERE numero_ley = '19.695' AND vigente")).rows[0]?.id ?? null;
    c.programa300 = (await db.query("SELECT id::text FROM programas WHERE codigo = '300'")).rows[0]?.id ?? null;
    const rem = await db.query(
      'SELECT DISTINCT grado_id::text AS id FROM remuneraciones_grado WHERE vigente_hasta IS NULL OR vigente_hasta >= now()',
    );
    for (const r of rem.rows) c.remunerados.add(r.id);
    return c;
  }

  private nuevo(n: NuevoCatalogo): Ref {
    const ref = `nuevo:${n.tabla}:${n.codigo}`;
    if (!this.nuevos.has(ref)) this.nuevos.set(ref, n);
    return ref;
  }

  // Grados ─────────────────────────────────────────────────────────────────
  /** { codigo, ref } o null si no se reconoce. */
  grado(valor: unknown): { codigo: string; ref: Ref } | null {
    const k = clave(valor);
    if (!k) return null;
    const codigo = GRADOS[k] ?? [...this.grados.values()].find((g) => clave(g.codigo) === k || clave(g.denominacion) === k)?.codigo;
    if (!codigo) return null;
    const g = this.grados.get(codigo);
    if (g) return { codigo, ref: g.id };
    const n = GRADOS_NUEVOS[codigo];
    return n ? { codigo, ref: this.nuevo({ tabla: 'grados', ...n }) } : null;
  }

  esCadete(codigoGrado: string | undefined): boolean {
    return !!codigoGrado && GRADOS_CADETE.has(codigoGrado);
  }

  // Escalafones ────────────────────────────────────────────────────────────
  /**
   * Escalafón de la fila. Sin escalafón: CADETE para cadetes, AT para aerotécnicos (se infiere
   * del grado) y SIN_DATO para el resto. `inferido` indica que no venía en el Access.
   */
  escalafon(valor: unknown, codigoGrado?: string): { codigo: string; ref: Ref; inferido: boolean } | null {
    const k = clave(valor);
    if (k === 'REIN') return null;
    if (!k) {
      const codigo = this.esCadete(codigoGrado) ? 'CADETE' : codigoGrado && GRADOS_AEROTECNICO.has(codigoGrado) ? 'AT' : 'SIN_DATO';
      return { codigo, ref: this.escalafonPorCodigo(codigo), inferido: true };
    }
    const codigo = ESCALAFONES[k] ?? [...this.escalafones.values()].find((e) => clave(e.codigo) === k || clave(e.denominacion) === k)?.codigo;
    return codigo ? { codigo, ref: this.escalafonPorCodigo(codigo), inferido: false } : null;
  }

  escalafonPorCodigo(codigo: string): Ref {
    const e = this.escalafones.get(codigo);
    if (e) return e.id;
    const n = ESCALAFONES_NUEVOS[codigo];
    if (!n) throw new Error(`Escalafón ${codigo} no está en la base ni se sabe crear.`);
    return this.nuevo({ tabla: 'escalafones', ...n });
  }

  // Unidades ───────────────────────────────────────────────────────────────
  /**
   * Unidad (y sub-unidad) para un destino del Access. Busca por código, por denominación y por
   * la sigla entre paréntesis de la denominación ("Base Aérea Nº 1 (B.A.I)"). Si hay más de una
   * unidad con la misma prioridad, es ambiguo y no se elige ninguna.
   */
  unidad(valor: unknown): { ref: Ref; subUnidad?: Ref } | { error: string } {
    const original = texto(valor);
    if (!original) return { error: 'sin destino' };
    let k = clave(original);
    const compania = COMPANIA.exec(k);
    if (compania) k = 'DIRPERS';
    if (DESTINOS_ALIAS[k]) k = clave(DESTINOS_ALIAS[k]);

    const porCodigo = this.unidades.filter((u) => clave(u.codigo) === k);
    const porDenominacion = this.unidades.filter((u) => clave(u.denominacion) === k);
    const porSigla = this.unidades.filter((u) => [...u.denominacion.matchAll(/\(([^)]+)\)/g)].some((m) => clave(m[1]) === k));
    const candidatos = [porCodigo, porDenominacion, porSigla].find((l) => l.length > 0) ?? [];
    if (candidatos.length > 1) return { error: `destino "${original}" coincide con ${candidatos.length} unidades de la base` };

    // Las variantes de escritura ("Serv. Sanidad." / "Serv.Sanidad") comparten clave, así que se crea
    // una sola unidad, con el nombre de DESNUM si está ahí.
    const canonico = this.desnum.get(k) ?? DESTINOS_ALIAS[clave(original)] ?? (compania ? 'Dir.Pers.' : original);
    const ref = candidatos[0]?.id ?? this.nuevo({
      tabla: 'unidades',
      codigo: canonico.slice(0, 30),
      denominacion: DENOMINACIONES[k] ?? canonico,
      vigente: !NO_VIGENTES.has(k),
    });
    if (!compania) return { ref };
    const letra = compania[1];
    const sub = this.subUnidades.find((s) => s.unidadId === ref && clave(s.denominacion) === `COMPANIA${letra}`);
    return {
      ref,
      subUnidad: sub?.id ?? this.nuevo({ tabla: 'sub_unidades', codigo: `CIA-${letra}`, denominacion: `Compañía ${letra}`, vigente: true, unidad: ref }),
    };
  }

  // Unidades de vuelo (tabla nuestra) ──────────────────────────────────────
  unidadVuelo(valor: unknown): Ref | null {
    const original = texto(valor);
    if (!original) return null;
    const k = claveUnidadVuelo(original);
    const u = this.unidadesVuelo.find((x) => claveUnidadVuelo(x.denominacion) === k);
    if (u) return u.id;
    // Se crea con el nombre de la primera variante que aparece, normalizada al formato de la base.
    const m = /^ESCAER(\d+)$/.exec(k);
    return this.nuevo({ tabla: 'unidades_vuelo', codigo: k, denominacion: m ? `Esc. Aér. ${m[1]}` : original, vigente: true });
  }

  situacion(codigo: string): string {
    const id = this.situaciones.get(codigo);
    if (!id) throw new Error(`La situación ${codigo} no está en la base.`);
    return id;
  }

  tieneRemuneracion(ref: Ref): boolean {
    return this.remunerados.has(ref);
  }

  faltantesGenerales(): string[] {
    const f: string[] = [];
    if (!this.regimenLeyNueva) f.push('régimen 19.695');
    if (!this.programa300) f.push('programa 300');
    for (const s of ['SIT01', 'SIT04', 'SIT07', 'SIT08', 'SIT12', 'SIT17']) if (!this.situaciones.has(s)) f.push(`situación ${s}`);
    return f;
  }
}

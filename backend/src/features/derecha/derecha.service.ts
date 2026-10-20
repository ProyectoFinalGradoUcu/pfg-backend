import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import {
  CriterioSugerencia,
  ESCALAS_DERECHA,
  EscalaDerecha,
  LOCK_DERECHA,
  NOMBRES_ESCALA,
  OperacionDerecha,
  TOPES_POR_GRADO,
} from './derecha.constants.js';
import { PrevisualizarDto } from './dto/previsualizar.dto.js';
import { HistorialDerechaQueryDto } from './dto/historial-query.dto.js';

type Db = PrismaService | Prisma.TransactionClient;

export interface ContextoCambio {
  motivo?: string | null;
  usuarioId?: bigint | null;
}

export interface Afectado {
  persona_id: string | null;
  nombre: string;
  grado: string | null;
  escalafon: string | null;
  antes: number | null;
  despues: number | null;
}

export interface Impacto {
  afectados: number;
  derecha: Afectado[];
  numor: Afectado[];
  avisos: string[];
}

export interface ResultadoCambio extends Impacto {
  lote_id: string | null;
}

export interface CambioDerecha {
  persona_id?: number;
  derecha?: number;
  numor?: number;
  grado_id?: number;
  orden?: number[];
}

export interface ValoresDerechaNumor {
  derecha?: number | null;
  numor?: number | null;
}

export interface OpcionesCambioGrado {
  posicion?: number | null;
  posicionNumor?: number | null;
  /** Relación que queda con la derecha. Por defecto, la vigente del funcionario. */
  relacionDestinoId?: bigint | null;
  /** Si el cambio de grado también cambia el escalafón. */
  escalafonDestinoId?: bigint | null;
  operacion?: OperacionDerecha;
}

interface GradoJerarquia {
  id: bigint;
  codigo: string;
  denominacion: string;
  escala: EscalaDerecha;
  posicion: number;
}

interface Integrante {
  relacionId: bigint;
  personaId: bigint;
  nombre: string;
  cedula: string;
  gradoId: bigint;
  escalafonId: bigint;
  derecha: number | null;
  numor: number | null;
  escala: EscalaDerecha | null;
  vigente: boolean;
}

interface Asignacion {
  derecha: number | null;
  numor: number | null;
  escala: EscalaDerecha | null;
}

interface Plan {
  operacion: OperacionDerecha;
  /** Personas cuya relación se mantiene en el padrón aunque ya no esté vigente. */
  conservar: bigint[];
  aplicar(padron: Padron): void;
}

const PERSONA_NUEVA = -1n;

const SIN_ASIGNACION: Asignacion = { derecha: null, numor: null, escala: null };

const SELECT_INTEGRANTE = {
  id: true,
  persona_id: true,
  grado_id: true,
  escalafon_id: true,
  derecha: true,
  numor: true,
  escala_derecha: true,
  fecha_fin: true,
  estado: true,
  personas: {
    select: {
      cedula: true,
      primer_nombre: true,
      segundo_nombre: true,
      primer_apellido: true,
      segundo_apellido: true,
    },
  },
} satisfies Prisma.relaciones_laboralesSelect;

type FilaIntegrante = Prisma.relaciones_laboralesGetPayload<{ select: typeof SELECT_INTEGRANTE }>;

const nombreCompleto = (p: FilaIntegrante['personas']) =>
  [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido]
    .filter(Boolean)
    .join(' ');

const aIntegrante = (r: FilaIntegrante): Integrante => ({
  relacionId: r.id,
  personaId: r.persona_id,
  nombre: nombreCompleto(r.personas),
  cedula: r.personas.cedula,
  gradoId: r.grado_id,
  escalafonId: r.escalafon_id,
  derecha: r.derecha,
  numor: r.numor,
  escala: r.escala_derecha as EscalaDerecha | null,
  vigente: r.fecha_fin === null && r.estado === 'activo',
});

const compararNulosAlFinal = (a: number | null, b: number | null) => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};

const compararIds = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

const claveGrupo = (gradoId: bigint, escalafonId: bigint) => `${gradoId}-${escalafonId}`;

/**
 * Foto en memoria de la derecha y el numor: una lista ordenada por grado y otra por
 * grupo (grado, escalafón). Las operaciones mueven integrantes entre listas y al
 * final los valores se reasignan con índice + 1, así nunca quedan huecos y cada
 * grado ocupa un bloque contiguo de su escala.
 */
class Padron {
  readonly grados = new Map<string, GradoJerarquia>();
  private readonly porGrado = new Map<string, Integrante[]>();
  private readonly porGrupo = new Map<string, Integrante[]>();

  constructor(
    readonly jerarquia: GradoJerarquia[],
    readonly escalafones: Map<string, string>,
    integrantes: Integrante[],
  ) {
    for (const g of jerarquia) {
      this.grados.set(g.id.toString(), g);
      this.porGrado.set(g.id.toString(), []);
    }

    const ordenados = [...integrantes].sort(
      (a, b) => compararNulosAlFinal(a.derecha, b.derecha) || compararIds(a.relacionId, b.relacionId),
    );
    for (const i of ordenados) {
      this.porGrado.get(i.gradoId.toString())?.push(i);
    }

    const ubicados = [...this.porGrado.values()]
      .flat()
      .sort((a, b) => compararNulosAlFinal(a.numor, b.numor) || compararIds(a.relacionId, b.relacionId));
    for (const i of ubicados) this.grupo(i.gradoId, i.escalafonId).push(i);
  }

  grado(gradoId: bigint): GradoJerarquia {
    const g = this.grados.get(gradoId.toString());
    if (!g) {
      throw new BadRequestException(
        `El grado ${gradoId} no tiene derecha: solo la tienen los grados de Oficiales y de Personal Subalterno`,
      );
    }
    return g;
  }

  tieneDerecha(gradoId: bigint) {
    return this.grados.has(gradoId.toString());
  }

  integrantesDeGrado(gradoId: bigint): Integrante[] {
    this.grado(gradoId);
    return this.porGrado.get(gradoId.toString())!;
  }

  grupo(gradoId: bigint, escalafonId: bigint): Integrante[] {
    const clave = claveGrupo(gradoId, escalafonId);
    if (!this.porGrupo.has(clave)) this.porGrupo.set(clave, []);
    return this.porGrupo.get(clave)!;
  }

  ubicacion(personaId: bigint): Integrante | null {
    for (const lista of this.porGrado.values()) {
      const i = lista.find((x) => x.personaId === personaId);
      if (i) return i;
    }
    return null;
  }

  requerirEnGrado(gradoId: bigint, personaId: bigint): Integrante {
    const i = this.integrantesDeGrado(gradoId).find((x) => x.personaId === personaId);
    if (!i) {
      throw new BadRequestException(
        `El funcionario ${personaId} no está en actividad en el grado ${this.grado(gradoId).denominacion}`,
      );
    }
    return i;
  }

  quitar(personaId: bigint): Integrante | null {
    const i = this.ubicacion(personaId);
    if (!i) return null;
    this.quitarDeLista(this.porGrado.get(i.gradoId.toString())!, i);
    this.quitarDeGrupo(i);
    return i;
  }

  quitarDeGrupo(i: Integrante) {
    this.quitarDeLista(this.grupo(i.gradoId, i.escalafonId), i);
  }

  insertarEnGrado(i: Integrante, posicion?: number | null) {
    const lista = this.integrantesDeGrado(i.gradoId);
    const indice = this.indiceDeInsercion(posicion, lista.length, () =>
      this.mensajeRangoGrado(i.gradoId, posicion!, lista.length + 1),
    );
    lista.splice(indice, 0, i);
  }

  insertarEnGrupo(i: Integrante, posicion?: number | null) {
    const lista = this.grupo(i.gradoId, i.escalafonId);
    const indice = this.indiceDeInsercion(posicion, lista.length, () =>
      this.mensajeRangoGrupo(i.gradoId, i.escalafonId, posicion!, lista.length + 1),
    );
    lista.splice(indice, 0, i);
  }

  moverEnGrado(gradoId: bigint, personaId: bigint, posicion: number) {
    const lista = this.integrantesDeGrado(gradoId);
    const i = this.requerirEnGrado(gradoId, personaId);
    if (posicion < 1 || posicion > lista.length) {
      throw new BadRequestException(this.mensajeRangoGrado(gradoId, posicion, lista.length));
    }
    this.quitarDeLista(lista, i);
    lista.splice(posicion - 1, 0, i);
  }

  moverEnGrupo(gradoId: bigint, escalafonId: bigint, personaId: bigint, posicion: number) {
    const lista = this.grupo(gradoId, escalafonId);
    const i = this.requerirEnGrupo(gradoId, escalafonId, personaId);
    if (posicion < 1 || posicion > lista.length) {
      throw new BadRequestException(
        this.mensajeRangoGrupo(gradoId, escalafonId, posicion, lista.length),
      );
    }
    this.quitarDeLista(lista, i);
    lista.splice(posicion - 1, 0, i);
  }

  ordenarGrado(gradoId: bigint, personaIds: bigint[]) {
    const lista = this.integrantesDeGrado(gradoId);
    const nuevo = this.permutar(lista, personaIds, `del grado ${this.grado(gradoId).denominacion}`);
    lista.splice(0, lista.length, ...nuevo);
  }

  ordenarGrupo(gradoId: bigint, escalafonId: bigint, personaIds: bigint[]) {
    this.grado(gradoId);
    const lista = this.grupo(gradoId, escalafonId);
    const nuevo = this.permutar(lista, personaIds, `del grupo ${this.nombreGrupo(gradoId, escalafonId)}`);
    lista.splice(0, lista.length, ...nuevo);
  }

  requerirEnGrupo(gradoId: bigint, escalafonId: bigint, personaId: bigint): Integrante {
    this.grado(gradoId);
    const i = this.grupo(gradoId, escalafonId).find((x) => x.personaId === personaId);
    if (!i) {
      throw new BadRequestException(
        `El funcionario ${personaId} no está en actividad en el grupo ${this.nombreGrupo(gradoId, escalafonId)}`,
      );
    }
    return i;
  }

  /** Valores finales por relación, numerados de 1 a N por escala y de 1 a M por grupo. */
  asignaciones(): Map<string, Asignacion> {
    const resultado = new Map<string, Asignacion>();
    for (const escala of ESCALAS_DERECHA) {
      let derecha = 0;
      for (const g of this.jerarquia.filter((x) => x.escala === escala)) {
        for (const i of this.porGrado.get(g.id.toString())!) {
          resultado.set(i.relacionId.toString(), { derecha: ++derecha, numor: null, escala });
        }
      }
    }
    for (const lista of this.porGrupo.values()) {
      lista.forEach((i, indice) => {
        const a = resultado.get(i.relacionId.toString());
        if (a) a.numor = indice + 1;
      });
    }
    return resultado;
  }

  /** Derecha que ocupa hoy el bloque del grado, del primero al último. */
  bloqueDeGrado(gradoId: bigint): { desde: number; hasta: number } {
    const lista = this.integrantesDeGrado(gradoId);
    const desde = this.asignaciones().get(lista[0].relacionId.toString())!.derecha!;
    return { desde, hasta: desde + lista.length - 1 };
  }

  avisosDeTope(): string[] {
    return this.jerarquia.flatMap((g) => {
      const tope = TOPES_POR_GRADO[g.codigo];
      const cantidad = this.porGrado.get(g.id.toString())!.length;
      return tope !== undefined && cantidad > tope
        ? [`El grado ${g.denominacion} quedaría con ${cantidad} funcionarios en actividad (lo habitual es ${tope}).`]
        : [];
    });
  }

  nombreEscalafon(escalafonId: bigint) {
    return this.escalafones.get(escalafonId.toString()) ?? null;
  }

  nombreGrupo(gradoId: bigint, escalafonId: bigint) {
    return `${this.grado(gradoId).denominacion} ${this.nombreEscalafon(escalafonId) ?? escalafonId}`;
  }

  private permutar(lista: Integrante[], personaIds: bigint[], descripcion: string) {
    const porPersona = new Map(lista.map((i) => [i.personaId.toString(), i]));
    const unicos = new Set(personaIds.map(String));
    if (
      personaIds.length !== lista.length ||
      unicos.size !== personaIds.length ||
      personaIds.some((id) => !porPersona.has(id.toString()))
    ) {
      throw new BadRequestException(
        `El orden enviado tiene que incluir exactamente una vez a cada uno de los ${lista.length} funcionarios en actividad ${descripcion}`,
      );
    }
    return personaIds.map((id) => porPersona.get(id.toString())!);
  }

  private indiceDeInsercion(posicion: number | null | undefined, largo: number, mensaje: () => string) {
    if (posicion === undefined || posicion === null) return largo;
    if (posicion < 1 || posicion > largo + 1) throw new BadRequestException(mensaje());
    return posicion - 1;
  }

  private quitarDeLista(lista: Integrante[], i: Integrante) {
    const indice = lista.indexOf(i);
    if (indice >= 0) lista.splice(indice, 1);
  }

  private mensajeRangoGrado(gradoId: bigint, posicion: number, maximo: number) {
    return `La posición ${posicion} está fuera del rango del grado ${this.grado(gradoId).denominacion} (de 1 a ${maximo})`;
  }

  private mensajeRangoGrupo(gradoId: bigint, escalafonId: bigint, posicion: number, maximo: number) {
    return `La posición de numor ${posicion} está fuera del rango del grupo ${this.nombreGrupo(gradoId, escalafonId)} (de 1 a ${maximo})`;
  }
}

/**
 * Único punto de escritura de `derecha` y `numor`. Ningún otro módulo los toca:
 * alta, baja, ascenso y cambio de escalafón llaman a los métodos `...EnTransaccion`
 * dentro de su propia transacción.
 */
@Injectable()
export class DerechaService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Lectura ──────────────────────────────────────────────────────────────

  async listarEscalas() {
    const { padron } = await this.cargarPadron(this.prisma, []);
    return ESCALAS_DERECHA.map((escala) => ({
      escala,
      nombre: NOMBRES_ESCALA[escala],
      grados: padron.jerarquia
        .filter((g) => g.escala === escala)
        .map((g) => this.resumenGrado(padron, g)),
    }));
  }

  /** Todo el padrón en el orden de la derecha: Oficiales primero, después Personal Subalterno. */
  async listarPersonal() {
    const { padron } = await this.cargarPadron(this.prisma, []);
    const porEscala = (e: EscalaDerecha) => ESCALAS_DERECHA.indexOf(e);
    return [...padron.jerarquia]
      .sort((a, b) => porEscala(a.escala) - porEscala(b.escala) || a.posicion - b.posicion)
      .flatMap((g) =>
        padron.integrantesDeGrado(g.id).map((i) => ({
          persona_id: i.personaId.toString(),
          nombre: i.nombre,
          cedula: i.cedula,
          escala: g.escala,
          grado_id: g.id.toString(),
          grado: g.denominacion,
          escalafon_id: i.escalafonId.toString(),
          escalafon: padron.nombreEscalafon(i.escalafonId),
          derecha: i.derecha,
          numor: i.numor,
        })),
      );
  }

  async obtenerGrado(gradoId: number) {
    const { padron } = await this.cargarPadron(this.prisma, []);
    const grado = padron.grado(BigInt(gradoId));
    const integrantes = padron.integrantesDeGrado(grado.id);

    const escalafones = new Map<string, { id: string; codigo: string | null; cantidad: number }>();
    for (const i of integrantes) {
      const clave = i.escalafonId.toString();
      const e = escalafones.get(clave) ?? { id: clave, codigo: padron.nombreEscalafon(i.escalafonId), cantidad: 0 };
      e.cantidad++;
      escalafones.set(clave, e);
    }

    return {
      ...this.resumenGrado(padron, grado),
      escala: grado.escala,
      escalafones: [...escalafones.values()],
      items: integrantes.map((i, indice) => ({
        persona_id: i.personaId.toString(),
        relacion_id: i.relacionId.toString(),
        nombre: i.nombre,
        cedula: i.cedula,
        derecha: i.derecha,
        posicion_grado: indice + 1,
        escalafon_id: i.escalafonId.toString(),
        escalafon: padron.nombreEscalafon(i.escalafonId),
        numor: i.numor,
      })),
    };
  }

  async obtenerGrupoNumor(gradoId: number, escalafonId: number) {
    const { padron } = await this.cargarPadron(this.prisma, []);
    const grado = padron.grado(BigInt(gradoId));
    const lista = padron.grupo(grado.id, BigInt(escalafonId));
    return {
      grado: { id: grado.id.toString(), codigo: grado.codigo, denominacion: grado.denominacion },
      escalafon: { id: String(escalafonId), codigo: padron.nombreEscalafon(BigInt(escalafonId)) },
      cantidad: lista.length,
      items: lista.map((i, indice) => ({
        persona_id: i.personaId.toString(),
        relacion_id: i.relacionId.toString(),
        nombre: i.nombre,
        cedula: i.cedula,
        derecha: i.derecha,
        numor: i.numor,
        posicion: indice + 1,
      })),
    };
  }

  /**
   * Orden propuesto para un grado. No persiste nada: la pantalla lo deja como
   * cambio pendiente y pasa por la previsualización como cualquier reorden.
   */
  async sugerirOrden(gradoId: number, criterio: CriterioSugerencia = 'ANTIGUEDAD') {
    const { padron } = await this.cargarPadron(this.prisma, []);
    const grado = padron.grado(BigInt(gradoId));
    const integrantes = padron.integrantesDeGrado(grado.id);

    const datos = await this.prisma.relaciones_laborales.findMany({
      where: { id: { in: integrantes.map((i) => i.relacionId) } },
      select: {
        id: true,
        fecha_inicio: true,
        fecha_ultimo_ascenso: true,
        personas: { select: { legajo_militar: { select: { fecha_egreso_eta: true } } } },
      },
    });
    const porRelacion = new Map(datos.map((d) => [d.id.toString(), d]));

    const fechas = integrantes.map((i, indice) => {
      const d = porRelacion.get(i.relacionId.toString());
      return {
        integrante: i,
        indice,
        ingreso_grado: d?.fecha_ultimo_ascenso ?? d?.fecha_inicio ?? null,
        egreso_eta: d?.personas.legajo_militar?.fecha_egreso_eta ?? null,
      };
    });

    const tiempo = (f: Date | null) => (f ? f.getTime() : null);
    const ordenados = [...fechas].sort((a, b) => {
      const porIngreso =
        criterio === 'ANTIGUEDAD' ? compararNulosAlFinal(tiempo(a.ingreso_grado), tiempo(b.ingreso_grado)) : 0;
      return (
        porIngreso ||
        compararNulosAlFinal(tiempo(a.egreso_eta), tiempo(b.egreso_eta)) ||
        a.indice - b.indice
      );
    });

    const sinDatos = fechas.filter((f) =>
      criterio === 'ANTIGUEDAD' ? f.ingreso_grado === null : f.egreso_eta === null,
    );

    return {
      grado_id: grado.id.toString(),
      criterio,
      orden: ordenados.map((f) => f.integrante.personaId.toString()),
      items: ordenados.map((f) => ({
        persona_id: f.integrante.personaId.toString(),
        nombre: f.integrante.nombre,
        ingreso_grado: f.ingreso_grado,
        egreso_eta: f.egreso_eta,
      })),
      sin_datos: sinDatos.map((f) => f.integrante.nombre),
    };
  }

  async historial(query: HistorialDerechaQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where = query.persona_id ? { persona_id: BigInt(query.persona_id) } : {};

    const [total, filas] = await Promise.all([
      this.prisma.historial_derecha_numor.count({ where }),
      this.prisma.historial_derecha_numor.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          personas: {
            select: { cedula: true, primer_nombre: true, segundo_nombre: true, primer_apellido: true, segundo_apellido: true },
          },
          usuarios: { select: { username: true } },
        },
      }),
    ]);

    return {
      items: filas.map((h) => ({
        id: h.id.toString(),
        persona_id: h.persona_id.toString(),
        nombre: nombreCompleto(h.personas),
        tipo: h.tipo,
        valor_anterior: h.valor_anterior,
        valor_nuevo: h.valor_nuevo,
        operacion: h.operacion,
        motivo: h.motivo,
        usuario: h.usuarios?.username ?? null,
        fecha: h.fecha,
        lote_id: h.lote_id,
      })),
      total,
      page,
      pageSize,
    };
  }

  // ─── Previsualización ─────────────────────────────────────────────────────

  async previsualizar(dto: PrevisualizarDto): Promise<Impacto> {
    const plan = await this.planDePrevisualizacion(this.prisma, dto);
    const { padron, guardados } = await this.cargarPadron(this.prisma, plan.conservar);
    plan.aplicar(padron);
    return this.calcularImpacto(padron, guardados).impacto;
  }

  // ─── Operaciones ──────────────────────────────────────────────────────────

  reordenarEnGrado(gradoId: number, personaId: number, posicion: number, ctx: ContextoCambio = {}) {
    return this.prisma.$transaction((tx) =>
      this.ejecutar(tx, this.planReorden(BigInt(gradoId), { personaId: BigInt(personaId), posicion }), ctx),
    );
  }

  ordenarGrado(gradoId: number, orden: number[], ctx: ContextoCambio = {}) {
    return this.prisma.$transaction((tx) =>
      this.ejecutar(tx, this.planReorden(BigInt(gradoId), { orden: orden.map(BigInt) }), ctx),
    );
  }

  reordenarNumor(
    gradoId: number,
    escalafonId: number,
    personaId: number,
    posicion: number,
    ctx: ContextoCambio = {},
  ) {
    return this.prisma.$transaction((tx) =>
      this.ejecutar(
        tx,
        this.planReordenNumor(BigInt(gradoId), BigInt(escalafonId), { personaId: BigInt(personaId), posicion }),
        ctx,
      ),
    );
  }

  ordenarNumor(gradoId: number, escalafonId: number, orden: number[], ctx: ContextoCambio = {}) {
    return this.prisma.$transaction((tx) =>
      this.ejecutar(
        tx,
        this.planReordenNumor(BigInt(gradoId), BigInt(escalafonId), { orden: orden.map(BigInt) }),
        ctx,
      ),
    );
  }

  moverAValores(personaId: bigint, valores: ValoresDerechaNumor, ctx: ContextoCambio = {}) {
    return this.prisma.$transaction((tx) => this.moverAValoresEnTransaccion(tx, personaId, valores, ctx));
  }

  /** Varios movimientos aplicados uno después del otro y guardados en un mismo lote. */
  async aplicarCambios(cambios: CambioDerecha[], ctx: ContextoCambio = {}) {
    const plan = this.planCambios(cambios);
    return this.prisma.$transaction((tx) => this.ejecutar(tx, plan, ctx));
  }

  /** Lleva al funcionario a una derecha y/o un numor concretos dentro de su grado y su grupo. */
  moverAValoresEnTransaccion(
    tx: Prisma.TransactionClient,
    personaId: bigint,
    valores: ValoresDerechaNumor,
    ctx: ContextoCambio = {},
  ) {
    return this.ejecutar(tx, this.planValores(personaId, valores), ctx);
  }

  asignarEnAlta(personaId: bigint, posicion?: number | null, posicionNumor?: number | null, ctx: ContextoCambio = {}) {
    return this.prisma.$transaction((tx) =>
      this.asignarEnAltaEnTransaccion(tx, personaId, posicion, posicionNumor, ctx),
    );
  }

  /** Sin posición, al final del grado y del grupo. Un grado sin derecha (cadetes) no hace nada. */
  async asignarEnAltaEnTransaccion(
    tx: Prisma.TransactionClient,
    personaId: bigint,
    posicion?: number | null,
    posicionNumor?: number | null,
    ctx: ContextoCambio = {},
  ) {
    const relacion = await this.relacionVigente(tx, personaId);
    return this.ejecutar(tx, this.planAlta(aIntegrante(relacion), posicion, posicionNumor), ctx);
  }

  quitarPorInactividad(personaId: bigint, ctx: ContextoCambio = {}) {
    return this.prisma.$transaction((tx) => this.quitarPorInactividadEnTransaccion(tx, personaId, ctx));
  }

  quitarPorInactividadEnTransaccion(
    tx: Prisma.TransactionClient,
    personaId: bigint,
    ctx: ContextoCambio = {},
  ) {
    return this.ejecutar(tx, this.planBaja(personaId), ctx);
  }

  ascender(
    personaId: bigint,
    gradoDestinoId: bigint,
    opciones: OpcionesCambioGrado = {},
    ctx: ContextoCambio = {},
  ) {
    return this.prisma.$transaction((tx) =>
      this.ascenderEnTransaccion(tx, personaId, gradoDestinoId, opciones, ctx),
    );
  }

  /**
   * Sale del bloque de su grado actual y entra en la posición elegida del grado
   * destino; el numor sale del grupo viejo y entra en el nuevo. Hay que llamarlo
   * mientras la relación de origen conserva su derecha: si se abre una relación
   * nueva, se pasa en `relacionDestinoId`.
   */
  async ascenderEnTransaccion(
    tx: Prisma.TransactionClient,
    personaId: bigint,
    gradoDestinoId: bigint,
    opciones: OpcionesCambioGrado = {},
    ctx: ContextoCambio = {},
  ) {
    const destino = await this.relacionDestino(tx, personaId, opciones.relacionDestinoId);
    return this.ejecutar(
      tx,
      this.planCambioGrado(
        destino,
        gradoDestinoId,
        opciones.posicion,
        opciones.posicionNumor,
        opciones.operacion,
        opciones.escalafonDestinoId,
      ),
      ctx,
    );
  }

  cambiarEscalafon(personaId: bigint, escalafonId: bigint, posicionNumor?: number | null, ctx: ContextoCambio = {}) {
    return this.prisma.$transaction((tx) =>
      this.cambiarEscalafonEnTransaccion(tx, personaId, escalafonId, posicionNumor, ctx),
    );
  }

  /** La derecha no cambia; el numor pasa al grupo del nuevo escalafón. */
  cambiarEscalafonEnTransaccion(
    tx: Prisma.TransactionClient,
    personaId: bigint,
    escalafonId: bigint,
    posicionNumor?: number | null,
    ctx: ContextoCambio = {},
  ) {
    return this.ejecutar(tx, this.planCambioEscalafon(personaId, escalafonId, posicionNumor), ctx);
  }

  // ─── Planes ───────────────────────────────────────────────────────────────

  private planReorden(
    gradoId: bigint,
    cambio: { personaId: bigint; posicion: number } | { orden: bigint[] },
  ): Plan {
    return {
      operacion: 'REORDEN',
      conservar: [],
      aplicar: (p) =>
        'orden' in cambio
          ? p.ordenarGrado(gradoId, cambio.orden)
          : p.moverEnGrado(gradoId, cambio.personaId, cambio.posicion),
    };
  }

  private planReordenNumor(
    gradoId: bigint,
    escalafonId: bigint,
    cambio: { personaId: bigint; posicion: number } | { orden: bigint[] },
  ): Plan {
    return {
      operacion: 'REORDEN',
      conservar: [],
      aplicar: (p) =>
        'orden' in cambio
          ? p.ordenarGrupo(gradoId, escalafonId, cambio.orden)
          : p.moverEnGrupo(gradoId, escalafonId, cambio.personaId, cambio.posicion),
    };
  }

  private planValores(personaId: bigint, { derecha, numor }: ValoresDerechaNumor): Plan {
    return {
      operacion: 'REORDEN',
      conservar: [],
      aplicar: (p) => {
        const actual = p.ubicacion(personaId);
        if (!actual) {
          throw new BadRequestException(
            `El funcionario ${personaId} no está en actividad o su grado no tiene derecha`,
          );
        }
        if (derecha != null) {
          const { desde, hasta } = p.bloqueDeGrado(actual.gradoId);
          if (derecha < desde || derecha > hasta) {
            throw new BadRequestException(
              `La derecha ${derecha} está fuera del bloque del grado ${p.grado(actual.gradoId).denominacion} (de ${desde} a ${hasta})`,
            );
          }
          p.moverEnGrado(actual.gradoId, personaId, derecha - desde + 1);
        }
        if (numor != null) {
          p.moverEnGrupo(actual.gradoId, actual.escalafonId, personaId, numor);
        }
      },
    };
  }

  /** Cada paso se aplica sobre el padrón que dejó el anterior, como se ve en la pantalla. */
  private planCambios(cambios: CambioDerecha[]): Plan {
    const pasos = cambios.map((c) => {
      if (c.orden) {
        if (c.grado_id == null) throw new BadRequestException('Un cambio con `orden` necesita grado_id');
        return this.planReorden(BigInt(c.grado_id), { orden: c.orden.map(BigInt) });
      }
      if (c.persona_id == null || (c.derecha == null && c.numor == null)) {
        throw new BadRequestException('Cada cambio necesita persona_id y una derecha o un numor, o grado_id y orden');
      }
      return this.planValores(BigInt(c.persona_id), { derecha: c.derecha, numor: c.numor });
    });
    return {
      operacion: 'REORDEN',
      conservar: [],
      aplicar: (p) => pasos.forEach((paso) => paso.aplicar(p)),
    };
  }

  private planAlta(integrante: Integrante, posicion?: number | null, posicionNumor?: number | null): Plan {
    return {
      operacion: 'ALTA',
      conservar: [],
      aplicar: (p) => {
        if (integrante.personaId !== PERSONA_NUEVA && p.ubicacion(integrante.personaId)) {
          throw new ConflictException(`${integrante.nombre} ya tiene derecha asignada`);
        }
        if (!p.tieneDerecha(integrante.gradoId)) {
          if (posicion != null || posicionNumor != null) p.grado(integrante.gradoId);
          return;
        }
        const nuevo = { ...integrante, derecha: null, numor: null };
        p.insertarEnGrado(nuevo, posicion);
        p.insertarEnGrupo(nuevo, posicionNumor);
      },
    };
  }

  private planBaja(personaId: bigint): Plan {
    return {
      operacion: 'BAJA',
      conservar: [personaId],
      aplicar: (p) => {
        p.quitar(personaId);
      },
    };
  }

  private planCambioGrado(
    destino: Integrante,
    gradoDestinoId: bigint,
    posicion?: number | null,
    posicionNumor?: number | null,
    operacion: OperacionDerecha = 'ASCENSO',
    escalafonDestinoId?: bigint | null,
  ): Plan {
    return {
      operacion,
      conservar: [destino.personaId],
      aplicar: (p) => {
        const actual = p.quitar(destino.personaId);
        if (!p.tieneDerecha(gradoDestinoId)) {
          if (posicion != null || posicionNumor != null) p.grado(gradoDestinoId);
          return;
        }
        const movido: Integrante = {
          ...(actual ?? destino),
          relacionId: destino.relacionId,
          gradoId: gradoDestinoId,
          escalafonId: escalafonDestinoId ?? destino.escalafonId,
        };
        p.insertarEnGrado(movido, posicion);
        p.insertarEnGrupo(movido, posicionNumor);
      },
    };
  }

  private planCambioEscalafon(personaId: bigint, escalafonId: bigint, posicionNumor?: number | null): Plan {
    return {
      operacion: 'CAMBIO_ESCALAFON',
      conservar: [],
      aplicar: (p) => {
        const actual = p.ubicacion(personaId);
        if (!actual) {
          throw new BadRequestException(`El funcionario ${personaId} no está en actividad o su grado no tiene derecha`);
        }
        p.quitarDeGrupo(actual);
        actual.escalafonId = escalafonId;
        p.insertarEnGrupo(actual, posicionNumor);
      },
    };
  }

  private async planDePrevisualizacion(db: Db, dto: PrevisualizarDto): Promise<Plan> {
    const requerir = <T>(valor: T | undefined, campo: string): T => {
      if (valor === undefined || valor === null) {
        throw new BadRequestException(`La operación ${dto.operacion} necesita ${campo}`);
      }
      return valor;
    };
    const movimiento = () =>
      dto.orden
        ? { orden: dto.orden.map(BigInt) }
        : {
            personaId: BigInt(requerir(dto.persona_id, 'persona_id u orden')),
            posicion: requerir(dto.posicion, 'posicion'),
          };

    switch (dto.operacion) {
      case 'REORDEN':
        if (dto.cambios) return this.planCambios(dto.cambios);
        if (dto.derecha != null || dto.numor != null) {
          return this.planValores(BigInt(requerir(dto.persona_id, 'persona_id')), {
            derecha: dto.derecha,
            numor: dto.numor,
          });
        }
        return this.planReorden(BigInt(requerir(dto.grado_id, 'grado_id')), movimiento());
      case 'REORDEN_NUMOR':
        return this.planReordenNumor(
          BigInt(requerir(dto.grado_id, 'grado_id')),
          BigInt(requerir(dto.escalafon_id, 'escalafon_id')),
          movimiento(),
        );
      case 'ALTA': {
        if (dto.persona_id) {
          const relacion = await this.relacionVigente(db, BigInt(dto.persona_id));
          return this.planAlta(aIntegrante(relacion), dto.posicion, dto.posicion_numor);
        }
        const nuevo: Integrante = {
          relacionId: PERSONA_NUEVA,
          personaId: PERSONA_NUEVA,
          nombre: 'Nuevo funcionario',
          cedula: '',
          gradoId: BigInt(requerir(dto.grado_id, 'grado_id o persona_id')),
          escalafonId: BigInt(requerir(dto.escalafon_id, 'escalafon_id')),
          derecha: null,
          numor: null,
          escala: null,
          vigente: true,
        };
        return this.planAlta(nuevo, dto.posicion, dto.posicion_numor);
      }
      case 'BAJA':
        return this.planBaja(BigInt(requerir(dto.persona_id, 'persona_id')));
      case 'ASCENSO': {
        const destino = await this.relacionDestino(db, BigInt(requerir(dto.persona_id, 'persona_id')));
        return this.planCambioGrado(
          destino,
          BigInt(requerir(dto.grado_id, 'grado_id')),
          dto.posicion,
          dto.posicion_numor,
        );
      }
      case 'CAMBIO_ESCALAFON':
        return this.planCambioEscalafon(
          BigInt(requerir(dto.persona_id, 'persona_id')),
          BigInt(requerir(dto.escalafon_id, 'escalafon_id')),
          dto.posicion_numor,
        );
    }
  }

  // ─── Motor ────────────────────────────────────────────────────────────────

  private async ejecutar(tx: Prisma.TransactionClient, plan: Plan, ctx: ContextoCambio): Promise<ResultadoCambio> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_DERECHA})`;

    const { padron, guardados } = await this.cargarPadron(tx, plan.conservar);
    plan.aplicar(padron);

    const { impacto, relaciones } = this.calcularImpacto(padron, guardados);
    if (relaciones.length === 0) return { ...impacto, lote_id: null };

    for (const r of relaciones) {
      await tx.relaciones_laborales.update({
        where: { id: r.relacionId },
        data: { derecha: r.derecha, numor: r.numor, escala_derecha: r.escala },
      });
    }

    const loteId = randomUUID();
    const registro = (tipo: 'DERECHA' | 'NUMOR') => (a: Afectado) => ({
      persona_id: BigInt(a.persona_id!),
      tipo,
      valor_anterior: a.antes,
      valor_nuevo: a.despues,
      operacion: plan.operacion,
      motivo: ctx.motivo?.trim() || null,
      usuario_id: ctx.usuarioId ?? null,
      lote_id: loteId,
    });
    await tx.historial_derecha_numor.createMany({
      data: [
        ...impacto.derecha.filter((a) => a.persona_id !== null).map(registro('DERECHA')),
        ...impacto.numor.filter((a) => a.persona_id !== null).map(registro('NUMOR')),
      ],
    });

    return { ...impacto, lote_id: loteId };
  }

  /**
   * Las relaciones con derecha que ya no están vigentes quedan afuera (y se les
   * pone null), salvo las de `conservar`: en un ascenso la relación vieja ya se
   * cerró pero todavía es la que tiene la ubicación del funcionario.
   */
  private async cargarPadron(db: Db, conservar: bigint[]) {
    const [jerarquia, escalafones, filas] = await Promise.all([
      db.derecha_jerarquia_grados.findMany({
        include: { grados: { select: { codigo: true, denominacion: true } } },
        orderBy: [{ escala: 'asc' }, { posicion: 'asc' }],
      }),
      db.escalafones.findMany({ select: { id: true, codigo: true } }),
      db.relaciones_laborales.findMany({
        where: { OR: [{ derecha: { not: null } }, { numor: { not: null } }] },
        select: SELECT_INTEGRANTE,
      }),
    ]);

    const guardados = filas.map(aIntegrante);
    const conservados = new Set(conservar.map(String));
    const padron = new Padron(
      jerarquia.map((j) => ({
        id: j.grado_id,
        codigo: j.grados.codigo,
        denominacion: j.grados.denominacion,
        escala: j.escala as EscalaDerecha,
        posicion: j.posicion,
      })),
      new Map(escalafones.map((e) => [e.id.toString(), e.codigo])),
      guardados
        .filter((i) => i.vigente || conservados.has(i.personaId.toString()))
        .map((i) => ({ ...i })),
    );
    return { padron, guardados };
  }

  /**
   * Compara lo guardado con lo que resulta del padrón. Persiste por relación y
   * reporta por persona: en un ascenso la derecha pasa de la relación vieja a la nueva.
   */
  private calcularImpacto(padron: Padron, guardados: Integrante[]) {
    const finales = padron.asignaciones();
    const ubicados = new Map<string, Integrante>();
    for (const g of padron.jerarquia) {
      for (const i of padron.integrantesDeGrado(g.id)) ubicados.set(i.relacionId.toString(), i);
    }

    const relaciones: Array<{ relacionId: bigint } & Asignacion> = [];
    const guardadosPorRelacion = new Map(guardados.map((g) => [g.relacionId.toString(), g]));
    const ids = new Set([...guardadosPorRelacion.keys(), ...finales.keys()]);
    for (const id of ids) {
      if (BigInt(id) === PERSONA_NUEVA) continue;
      const antes = guardadosPorRelacion.get(id) ?? SIN_ASIGNACION;
      const despues = finales.get(id) ?? SIN_ASIGNACION;
      if (antes.derecha !== despues.derecha || antes.numor !== despues.numor || antes.escala !== despues.escala) {
        relaciones.push({ relacionId: BigInt(id), ...despues });
      }
    }

    type Estado = { nombre: string; gradoId: bigint; escalafonId: bigint; derecha: number | null; numor: number | null };
    const antesPorPersona = new Map<string, Estado>();
    for (const g of guardados) {
      const previo = antesPorPersona.get(g.personaId.toString());
      if (!previo || (previo.derecha === null && g.derecha !== null)) {
        antesPorPersona.set(g.personaId.toString(), { ...g });
      }
    }
    const despuesPorPersona = new Map<string, Estado>();
    for (const [relacionId, a] of finales) {
      const i = ubicados.get(relacionId)!;
      despuesPorPersona.set(i.personaId.toString(), { ...i, derecha: a.derecha, numor: a.numor });
    }

    const derecha: Afectado[] = [];
    const numor: Afectado[] = [];
    const personas = new Set([...antesPorPersona.keys(), ...despuesPorPersona.keys()]);
    for (const personaId of personas) {
      const antes = antesPorPersona.get(personaId);
      const despues = despuesPorPersona.get(personaId);
      const ref = despues ?? antes!;
      const afectado = (a: number | null, d: number | null): Afectado => ({
        persona_id: BigInt(personaId) === PERSONA_NUEVA ? null : personaId,
        nombre: ref.nombre,
        grado: padron.grados.get(ref.gradoId.toString())?.denominacion ?? null,
        escalafon: padron.nombreEscalafon(ref.escalafonId),
        antes: a,
        despues: d,
      });
      const [dA, dD] = [antes?.derecha ?? null, despues?.derecha ?? null];
      const [nA, nD] = [antes?.numor ?? null, despues?.numor ?? null];
      if (dA !== dD) derecha.push(afectado(dA, dD));
      if (nA !== nD) numor.push(afectado(nA, nD));
    }

    const porValor = (a: Afectado, b: Afectado) =>
      compararNulosAlFinal(a.despues ?? a.antes, b.despues ?? b.antes);
    derecha.sort(porValor);
    numor.sort(porValor);

    const afectados = new Set([...derecha, ...numor].map((a) => a.persona_id ?? 'nuevo')).size;
    return { impacto: { afectados, derecha, numor, avisos: padron.avisosDeTope() }, relaciones };
  }

  private resumenGrado(padron: Padron, g: GradoJerarquia) {
    const integrantes = padron.integrantesDeGrado(g.id);
    const derechas = integrantes.map((i) => i.derecha).filter((d): d is number => d !== null);
    const tope = TOPES_POR_GRADO[g.codigo] ?? null;
    return {
      id: g.id.toString(),
      codigo: g.codigo,
      denominacion: g.denominacion,
      escala: g.escala,
      cantidad: integrantes.length,
      derecha_desde: derechas.length ? Math.min(...derechas) : null,
      derecha_hasta: derechas.length ? Math.max(...derechas) : null,
      tope,
      excede_tope: tope !== null && integrantes.length > tope,
    };
  }

  private async relacionVigente(db: Db, personaId: bigint): Promise<FilaIntegrante> {
    const relacion = await db.relaciones_laborales.findFirst({
      where: { persona_id: personaId, fecha_fin: null, estado: 'activo' },
      orderBy: { fecha_inicio: 'desc' },
      select: SELECT_INTEGRANTE,
    });
    if (!relacion) {
      throw new BadRequestException(`El funcionario ${personaId} no está en actividad`);
    }
    return relacion;
  }

  private async relacionDestino(db: Db, personaId: bigint, relacionId?: bigint | null): Promise<Integrante> {
    if (!relacionId) return aIntegrante(await this.relacionVigente(db, personaId));
    const relacion = await db.relaciones_laborales.findUnique({
      where: { id: relacionId },
      select: SELECT_INTEGRANTE,
    });
    if (!relacion || relacion.persona_id !== personaId) {
      throw new NotFoundException(`No existe la relación laboral ${relacionId} del funcionario ${personaId}`);
    }
    return aIntegrante(relacion);
  }
}

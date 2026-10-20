import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import {
  Catalogo,
  ColumnaPlantilla,
  DefinicionPlantilla,
  FilaLeida,
  PadronDeCarga,
  ResultadoCarga,
  construirPlantilla,
  leerHoja,
  parsearFecha,
  procesarEnSerie,
  resumir,
  separarRepetidas,
} from '../../lib/carga-masiva';
import { DestinosService } from './destinos.service';

const COLUMNAS: ColumnaPlantilla[] = [
  { clave: 'cedula', titulo: 'Cédula', requerida: true, ayuda: 'Funcionario ya registrado en Personal. Sin puntos ni guión.' },
  { clave: 'unidad', titulo: 'Unidad', requerida: true, tipo: 'lista', lista: 'unidades', ancho: 45 },
  { clave: 'fecha_inicio', titulo: 'Fecha de inicio', requerida: true, tipo: 'fecha' },
  { clave: 'fecha_fin', titulo: 'Fecha de fin', tipo: 'fecha',
    ayuda: 'Vacía = es el destino actual del funcionario. Con fecha = destino anterior (historial).' },
  { clave: 'posicion_destino', titulo: 'Cargo / posición', ancho: 30 },
  { clave: 'numero_orden', titulo: 'N.º de orden', ayuda: 'Hace falta el N.º de orden o el boletín (al menos uno).' },
  { clave: 'boletin', titulo: 'Boletín', ayuda: 'Hace falta el N.º de orden o el boletín (al menos uno).' },
  { clave: 'observaciones', titulo: 'Observaciones', ancho: 40 },
];

type UnidadCatalogo = { id: bigint; codigo: string; nombre: string };

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('/') : '');

@Injectable()
export class DestinosCargaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly destinosService: DestinosService,
  ) {}

  async generarPlantilla(): Promise<Buffer> {
    return construirPlantilla(this.definicion(await this.cargarUnidades()));
  }

  /**
   * Con fecha de fin es historial y no toca el destino actual. Sin fecha de fin es el destino
   * actual: si es la misma unidad lo corrige, si es otra hace el pase como el alta manual.
   */
  async procesarCarga(buffer: Buffer): Promise<ResultadoCarga> {
    const unidades = await this.cargarUnidades();
    const filas = await leerHoja(buffer, this.definicion(unidades));
    const padron = await PadronDeCarga.cargar(this.prisma, filas);

    const actuales = filas.filter((f) => !f.valores['fecha_fin']);
    const { unicas: actualesUnicas, repetidas } = separarRepetidas(
      actuales,
      (f) => f.valores['cedula'],
      (previa) => `El funcionario ya tiene otro destino actual (sin fecha de fin) en la fila ${previa}.`,
    );
    const historicas = filas.filter((f) => f.valores['fecha_fin']);

    const resultados = await procesarEnSerie([...actualesUnicas, ...historicas], async (fila) => {
      const persona = padron.militar(fila.valores['cedula']);
      const datos = this.validarFila(fila, unidades);
      return datos.fechaFin
        ? this.registrarHistorico(persona.id, datos)
        : this.registrarActual(persona.id, datos);
    });

    return resumir([...resultados, ...repetidas]);
  }

  private validarFila(fila: FilaLeida, unidades: Catalogo<UnidadCatalogo>) {
    const v = fila.valores;
    if (!v['unidad']) throw new Error('Falta la unidad.');
    const unidad = unidades.resolver(v['unidad']);
    const fechaInicio = parsearFecha(v['fecha_inicio'], 'Fecha de inicio');
    if (!fechaInicio) throw new Error('Falta la fecha de inicio.');
    const fechaFin = parsearFecha(v['fecha_fin'], 'Fecha de fin');
    if (fechaFin && fechaFin < fechaInicio) throw new Error('La fecha de fin es anterior a la fecha de inicio.');
    if (!v['numero_orden'] && !v['boletin']) throw new Error('Falta el N.º de orden o el boletín (al menos uno).');
    return {
      unidad,
      fechaInicio,
      fechaFin,
      posicion_destino: v['posicion_destino'] || null,
      numero_orden: v['numero_orden'] || null,
      boletin: v['boletin'] || null,
      observaciones: v['observaciones'] || null,
    };
  }

  private async registrarHistorico(personaId: bigint, d: ReturnType<DestinosCargaService['validarFila']>) {
    const inicio = new Date(d.fechaInicio);
    const fin = new Date(d.fechaFin!);
    const superpuesto = await this.prisma.destinos.findFirst({
      where: {
        persona_id: personaId,
        fecha_inicio: { lte: fin },
        OR: [{ fecha_fin: null }, { fecha_fin: { gte: inicio } }],
      },
      include: { unidades: { select: { denominacion: true } } },
      orderBy: { fecha_inicio: 'asc' },
    });
    if (superpuesto) {
      if (superpuesto.unidad_id === d.unidad.id && superpuesto.fecha_inicio?.getTime() === inicio.getTime()) {
        throw new Error('Ese destino ya está registrado.');
      }
      const hasta = superpuesto.fecha_fin ? `al ${fmt(superpuesto.fecha_fin)}` : 'en adelante (destino actual)';
      throw new Error(
        `Se superpone con el destino en ${superpuesto.unidades?.denominacion ?? 'otra unidad'} ` +
          `del ${fmt(superpuesto.fecha_inicio)} ${hasta}.` +
          (superpuesto.fecha_fin ? '' : ' Incluí el destino actual sin fecha de fin con su fecha de inicio real.'),
      );
    }

    const creado = await this.prisma.destinos.create({
      data: {
        persona_id: personaId,
        unidad_id: d.unidad.id,
        fecha_inicio: inicio,
        fecha_fin: fin,
        posicion_destino: d.posicion_destino,
        numero_orden: d.numero_orden,
        boletin: d.boletin,
        observaciones: d.observaciones,
      },
    });
    return { id: creado.id, mensaje: `Historial: ${d.unidad.nombre}` };
  }

  private async registrarActual(personaId: bigint, d: ReturnType<DestinosCargaService['validarFila']>) {
    const inicio = new Date(d.fechaInicio);
    const activo = await this.prisma.destinos.findFirst({ where: { persona_id: personaId, fecha_fin: null } });

    if (activo && activo.unidad_id === d.unidad.id) {
      const cerradoDespues = await this.prisma.destinos.findFirst({
        where: { persona_id: personaId, id: { not: activo.id }, fecha_fin: { gte: inicio } },
      });
      if (cerradoDespues) {
        throw new Error(`La fecha de inicio se superpone con un destino anterior que termina el ${fmt(cerradoDespues.fecha_fin)}.`);
      }
      await this.prisma.destinos.update({
        where: { id: activo.id },
        data: {
          fecha_inicio: inicio,
          posicion_destino: d.posicion_destino ?? activo.posicion_destino,
          numero_orden: d.numero_orden ?? activo.numero_orden,
          boletin: d.boletin ?? activo.boletin,
          observaciones: d.observaciones ?? activo.observaciones,
        },
      });
      return { id: activo.id, mensaje: `Destino actual en ${d.unidad.nombre} actualizado` };
    }

    if (activo?.fecha_inicio && inicio <= activo.fecha_inicio) {
      throw new Error(
        `Ya tiene un destino actual desde el ${fmt(activo.fecha_inicio)}, posterior a esta fila. ` +
          'Si esta fila es historial, completá la fecha de fin.',
      );
    }

    const creado = (await this.destinosService.crearDestino({
      persona_id: Number(personaId),
      unidad_id: Number(d.unidad.id),
      fecha_inicio: d.fechaInicio,
      posicion_destino: d.posicion_destino ?? undefined,
      numero_orden: d.numero_orden ?? undefined,
      boletin: d.boletin ?? undefined,
      observaciones: d.observaciones ?? undefined,
    })) as { id: string };
    return {
      id: BigInt(creado.id),
      mensaje: activo ? `Pase de destino a ${d.unidad.nombre}` : `Destino actual: ${d.unidad.nombre}`,
    };
  }

  private async cargarUnidades(): Promise<Catalogo<UnidadCatalogo>> {
    const unidades = await this.prisma.unidades.findMany({
      where: { vigente: true },
      orderBy: { denominacion: 'asc' },
      select: { id: true, codigo: true, denominacion: true },
    });
    return new Catalogo('Unidad', unidades.map((u) => ({ id: u.id, codigo: u.codigo, nombre: u.denominacion })));
  }

  private definicion(unidades: Catalogo<UnidadCatalogo>): DefinicionPlantilla {
    return {
      hoja: 'Destinos',
      titulo: 'Carga masiva de destinos',
      columnas: COLUMNAS,
      listas: [{ nombre: 'unidades', titulo: 'Unidad', valores: unidades.etiquetas }],
      instrucciones: [
        'Una fila por destino. Para el historial de un funcionario, cargá una fila por cada unidad por la que pasó.',
        'La fila SIN fecha de fin es el destino actual: si es la misma unidad que figura hoy, corrige su fecha de inicio; ' +
          'si es otra unidad, registra el pase y cierra el destino anterior el día previo.',
        'Las filas CON fecha de fin quedan como historial y no pueden superponerse con otros destinos del funcionario.',
      ],
      ejemplos: [
        {
          cedula: '12345678', unidad: unidades.etiquetas[0] ?? '',
          fecha_inicio: new Date('2015-02-01T00:00:00Z'), fecha_fin: new Date('2019-12-31T00:00:00Z'),
          posicion_destino: 'Jefe de sección', numero_orden: 'O.D. 10.120',
        },
        {
          cedula: '12345678', unidad: unidades.etiquetas[1] ?? unidades.etiquetas[0] ?? '',
          fecha_inicio: new Date('2020-01-01T00:00:00Z'), numero_orden: 'O.D. 11.874',
        },
      ],
    };
  }
}

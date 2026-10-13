import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import {
  Catalogo,
  ColumnaPlantilla,
  DefinicionPlantilla,
  PadronDeCarga,
  ResultadoCarga,
  construirPlantilla,
  leerHoja,
  normalizar,
  parsearFecha,
  procesarEnSerie,
  resumir,
  separarRepetidas,
} from '../../lib/carga-masiva';

const COLUMNAS: ColumnaPlantilla[] = [
  { clave: 'mision', titulo: 'Misión', requerida: true, tipo: 'lista', lista: 'misiones', listaEstricta: false, ancho: 40,
    ayuda: 'Elegí una misión de la lista o escribí el nombre de una nueva: se crea automáticamente (completá también el País).' },
  { clave: 'pais', titulo: 'País', ayuda: 'Solo hace falta si la misión es nueva.' },
  { clave: 'numero_orden', titulo: 'N.º de orden de la convocatoria',
    ayuda: 'Identifica la convocatoria junto con el boletín. Las filas con la misma misión, orden y boletín van a la misma convocatoria.' },
  { clave: 'boletin', titulo: 'Boletín de la convocatoria', ayuda: 'Hace falta el N.º de orden o el boletín (al menos uno).' },
  { clave: 'fecha_salida', titulo: 'Fecha de salida', tipo: 'fecha' },
  { clave: 'fecha_llegada', titulo: 'Fecha de llegada', tipo: 'fecha', ayuda: 'Vacía si todavía no volvió.' },
  { clave: 'cedula', titulo: 'Cédula', requerida: true, ayuda: 'Funcionario ya registrado en Personal. Sin puntos ni guión.' },
  { clave: 'observaciones', titulo: 'Observaciones del funcionario', ancho: 40 },
];

type MisionCatalogo = { id: bigint; nombre: string; codigo: null };

@Injectable()
export class MisionesCargaService {
  constructor(private readonly prisma: PrismaService) {}

  async generarPlantilla(): Promise<Buffer> {
    return construirPlantilla(this.definicion(await this.cargarMisiones()));
  }

  /**
   * Cada fila es un participante. La misión se busca por nombre (y se crea si no existe) y la
   * convocatoria por misión + N.º de orden + boletín (y se crea con la primera fila que la nombra).
   */
  async procesarCarga(buffer: Buffer): Promise<ResultadoCarga> {
    let misiones = await this.cargarMisiones();
    const filas = await leerHoja(buffer, this.definicion(misiones));
    const padron = await PadronDeCarga.cargar(this.prisma, filas);

    const claveConvocatoria = (mision: string, orden: string, boletin: string) =>
      `${normalizar(mision)}|${normalizar(orden)}|${normalizar(boletin)}`;
    const { unicas, repetidas } = separarRepetidas(
      filas,
      (f) => (f.valores['cedula'] ? `${f.valores['cedula']}|${claveConvocatoria(f.valores['mision'] ?? '', f.valores['numero_orden'] ?? '', f.valores['boletin'] ?? '')}` : ''),
      (previa) => `El funcionario ya figura en la misma convocatoria en la fila ${previa}.`,
    );

    const resultados = await procesarEnSerie(unicas, async ({ valores: v }) => {
      const persona = padron.militar(v['cedula']);
      if (!v['mision']) throw new Error('Falta la misión.');
      if (!v['numero_orden'] && !v['boletin']) {
        throw new Error('Falta el N.º de orden o el boletín de la convocatoria (al menos uno).');
      }
      const salida = parsearFecha(v['fecha_salida'], 'Fecha de salida');
      const llegada = parsearFecha(v['fecha_llegada'], 'Fecha de llegada');
      if (salida && llegada && llegada < salida) throw new Error('La fecha de llegada es anterior a la de salida.');

      const novedades: string[] = [];

      let mision = misiones.buscar(v['mision']);
      if (!mision) {
        if (!v['pais']) throw new Error(`La misión "${v['mision']}" no existe. Para crearla completá el País.`);
        const creada = await this.prisma.misiones.create({ data: { nombre_mision: v['mision'], pais: v['pais'] } });
        // Se recarga para que las filas siguientes con el mismo nombre la encuentren.
        misiones = await this.cargarMisiones();
        mision = misiones.resolver(creada.nombre_mision!);
        novedades.push('misión creada');
      }

      const orden = v['numero_orden'] || null;
      const boletin = v['boletin'] || null;
      let convocatoria = await this.prisma.convocatorias.findFirst({
        where: {
          mision_id: mision.id,
          numero_orden: orden ? { equals: orden, mode: 'insensitive' } : null,
          boletin: boletin ? { equals: boletin, mode: 'insensitive' } : null,
        },
      });
      if (!convocatoria) {
        convocatoria = await this.prisma.convocatorias.create({
          data: {
            mision_id: mision.id,
            numero_orden: orden,
            boletin,
            fecha_salida: salida ? new Date(salida) : null,
            fecha_llegada: llegada ? new Date(llegada) : null,
          },
        });
        novedades.push('convocatoria creada');
      } else if (
        (salida && convocatoria.fecha_salida && convocatoria.fecha_salida.toISOString().slice(0, 10) !== salida) ||
        (llegada && convocatoria.fecha_llegada && convocatoria.fecha_llegada.toISOString().slice(0, 10) !== llegada)
      ) {
        throw new Error('Las fechas no coinciden con las de la convocatoria ya registrada con ese N.º de orden y boletín.');
      } else if ((salida && !convocatoria.fecha_salida) || (llegada && !convocatoria.fecha_llegada)) {
        // La convocatoria existía sin fechas: la planilla las completa.
        convocatoria = await this.prisma.convocatorias.update({
          where: { id: convocatoria.id },
          data: {
            ...(salida && !convocatoria.fecha_salida ? { fecha_salida: new Date(salida) } : {}),
            ...(llegada && !convocatoria.fecha_llegada ? { fecha_llegada: new Date(llegada) } : {}),
          },
        });
      }

      const yaAsignado = await this.prisma.funcionarios_convocatorias.findFirst({
        where: { convocatoria_id: convocatoria.id, persona_id: persona.id },
        select: { id: true },
      });
      if (yaAsignado) throw new Error(`${persona.nombre} ya está designado en esa convocatoria.`);

      const asignacion = await this.prisma.funcionarios_convocatorias.create({
        data: {
          convocatoria_id: convocatoria.id,
          persona_id: persona.id,
          numero_orden: orden,
          boletin,
          observaciones: v['observaciones'] || null,
        },
      });

      return {
        id: asignacion.id,
        mensaje: `${persona.nombre} → ${mision.nombre}${novedades.length ? ` (${novedades.join(', ')})` : ''}`,
      };
    });

    return resumir([...resultados, ...repetidas]);
  }

  private async cargarMisiones(): Promise<Catalogo<MisionCatalogo>> {
    const misiones = await this.prisma.misiones.findMany({
      orderBy: { nombre_mision: 'asc' },
      select: { id: true, nombre_mision: true },
    });
    return new Catalogo(
      'Misión',
      misiones.filter((m) => m.nombre_mision).map((m) => ({ id: m.id, nombre: m.nombre_mision!, codigo: null })),
    );
  }

  private definicion(misiones: Catalogo<MisionCatalogo>): DefinicionPlantilla {
    return {
      hoja: 'Participantes',
      titulo: 'Carga masiva de misiones y participantes',
      columnas: COLUMNAS,
      listas: [{ nombre: 'misiones', titulo: 'Misión', valores: misiones.etiquetas }],
      instrucciones: [
        'Una fila por funcionario designado. Para varios funcionarios de la misma convocatoria, repetí la misión, el N.º de orden y el boletín.',
        'Si la misión no existe, escribí su nombre y el País: se crea con la primera fila. La convocatoria también se crea sola.',
        'Las fechas de salida y llegada son de la convocatoria: tienen que coincidir en todas sus filas.',
      ],
      ejemplos: [
        {
          mision: misiones.etiquetas[0] ?? 'Congo (MONUSCO)', pais: '', numero_orden: 'ORD-2019-014', boletin: '',
          fecha_salida: new Date('2019-03-01T00:00:00Z'), fecha_llegada: new Date('2019-09-30T00:00:00Z'), cedula: '12345678',
        },
        {
          mision: 'Misión nueva de ejemplo', pais: 'Haití', numero_orden: 'ORD-2020-003', boletin: 'BOL-2020-02',
          fecha_salida: new Date('2020-02-01T00:00:00Z'), cedula: '87654321', observaciones: 'Jefe de contingente',
        },
      ],
    };
  }
}

import { PrismaService } from '../prisma.service.js';
import { AlcanceResuelto } from '../alcance/alcance.types.js';
import { wherePersonasPorAlcance } from '../alcance/alcance.where.js';
import { FilaLeida } from './carga-masiva.types.js';
import { normalizarCedula } from './valores.js';

export interface PersonaDeCarga {
  id: bigint;
  cedula: string;
  es_civil: boolean | null;
  nombre: string;
}

/**
 * Resuelve de una sola consulta todas las cédulas del archivo (ya normalizadas en la fila).
 * Con alcance de unidad solo encuentra a quienes revistan en las unidades del usuario.
 */
export class PadronDeCarga {
  private constructor(private readonly porCedula: Map<string, PersonaDeCarga>) {}

  static async cargar(prisma: PrismaService, filas: FilaLeida[], alcance?: AlcanceResuelto): Promise<PadronDeCarga> {
    for (const f of filas) f.valores['cedula'] = normalizarCedula(f.valores['cedula'] ?? '');
    const cedulas = [...new Set(filas.map((f) => f.valores['cedula']).filter(Boolean))];
    const personas = await prisma.personas.findMany({
      where: { cedula: { in: cedulas }, ...(alcance ? wherePersonasPorAlcance(alcance) : {}) },
      select: { id: true, cedula: true, es_civil: true, primer_nombre: true, primer_apellido: true },
    });
    return new PadronDeCarga(
      new Map(
        personas.map((p) => [
          p.cedula,
          { id: p.id, cedula: p.cedula, es_civil: p.es_civil, nombre: `${p.primer_nombre} ${p.primer_apellido}` },
        ]),
      ),
    );
  }

  /** Funcionario militar de la fila. Lanza con un mensaje para el resumen si no se puede usar. */
  militar(cedula: string): PersonaDeCarga {
    if (!cedula) throw new Error('Falta la cédula.');
    const persona = this.porCedula.get(cedula);
    if (!persona) {
      throw new Error(`No hay ningún funcionario con cédula ${cedula} (o no está en tus unidades). Cargalo primero en Personal.`);
    }
    if (persona.es_civil) throw new Error(`La cédula ${cedula} es de un civil (${persona.nombre}), no de un funcionario militar.`);
    return persona;
  }
}

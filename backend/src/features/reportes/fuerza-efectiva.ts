import { PrismaService } from '../../lib/prisma.service';
import { categoriaDeFiltros } from './definiciones/_helpers';
import { whereRelacionPorBase } from './alcance-reportes';

/** Una persona = un efectivo. Ante datos inconsistentes se toma la relación vigente más reciente. */
export async function consultarFuerzaEfectiva(prisma: PrismaService, filtros: Record<string, string | undefined>) {
  const categoria = categoriaDeFiltros(filtros);
  const relaciones = await prisma.relaciones_laborales.findMany({
    where: {
      estado: 'activo', fecha_fin: null,
      ...whereRelacionPorBase(filtros),
      ...(categoria && { tipo_funcionario: categoria }),
    },
    orderBy: [{ fecha_inicio: 'desc' }, { id: 'desc' }],
    select: {
      persona_id: true, grado_reincorporacion_id: true,
      personas: { select: { genero: true } },
      grados: { select: { id: true, denominacion: true, orden: true, es_oficial: true, es_subalterno: true } },
    },
  });
  return [...new Map(relaciones.slice().reverse().map(r => [r.persona_id.toString(), r])).values()];
}

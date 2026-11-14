import { PrismaService } from '../../lib/prisma.service';

export interface UnidadLegible {
  id: string;
  codigo: string | null;
  denominacion: string | null;
  comando: string;
}

/**
 * Bases a las que pertenece una cuenta, con denominación y comando para la bitácora.
 *
 * El cambio de unidad de un usuario se puede hacer desde Usuarios (reemplaza todas) o desde
 * Unidades (agrega o quita una). Los dos caminos auditan el antes y el después con esto, para
 * que el registro se lea igual sin importar de qué pantalla vino.
 */
export async function unidadesDeUsuario(
  prisma: PrismaService,
  usuarioId: bigint,
): Promise<UnidadLegible[]> {
  const filas = await prisma.usuarios_sub_unidades.findMany({
    where: { usuario_id: usuarioId },
    select: {
      sub_unidades: {
        select: {
          id: true,
          codigo: true,
          denominacion: true,
          unidades: { select: { denominacion: true } },
        },
      },
    },
    orderBy: { sub_unidades: { denominacion: 'asc' } },
  });
  return filas.map(({ sub_unidades: b }) => ({
    id: b.id.toString(),
    codigo: b.codigo,
    denominacion: b.denominacion,
    comando: b.unidades.denominacion,
  }));
}

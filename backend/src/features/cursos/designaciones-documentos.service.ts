import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';
import { ConfigDocumentos, DocumentosDeRegistro } from '../archivos/documentos-de-registro';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import {
  assertCursoGestionableEnAlcance,
  assertCursoVisibleEnAlcance,
  assertPersonaEnAlcance,
} from '../../lib/alcance/alcance.where';

const CONFIG: ConfigDocumentos = {
  modelo: 'funcionarios_cursos',
  entidad: 'funcionarios_cursos',
  articulo: 'La',
  nombre: 'designación',
  noEncontrado: 'Designación no encontrada',
};

const pasa = (verificacion: Promise<void>): Promise<boolean> =>
  verificacion.then(
    () => true,
    (err) => {
      if (err instanceof NotFoundException) return false;
      throw err;
    },
  );

@Injectable()
export class DesignacionesDocumentosService extends DocumentosDeRegistro {
  constructor(prisma: PrismaService, archivos: ArchivosService) {
    super(prisma, archivos, CONFIG);
  }

  // También pasa con el funcionario en alcance: la ficha muestra sus cursos aunque el curso sea de otra base.
  async verificarVer(cursoId: bigint, id: bigint, alcance: AlcanceResuelto): Promise<void> {
    const designacion = await this.prisma.funcionarios_cursos.findFirst({
      where: { id, curso_id: cursoId },
      select: { persona_id: true },
    });
    if (!designacion) throw new NotFoundException(CONFIG.noEncontrado);

    if (await pasa(assertCursoVisibleEnAlcance(this.prisma, cursoId, alcance))) return;
    if (await pasa(assertPersonaEnAlcance(this.prisma, designacion.persona_id, alcance))) return;
    throw new NotFoundException(CONFIG.noEncontrado);
  }

  async verificarGestionar(cursoId: bigint, ids: bigint[], alcance: AlcanceResuelto): Promise<void> {
    await assertCursoGestionableEnAlcance(this.prisma, cursoId, alcance);

    const unicos = [...new Set(ids)];
    const delCurso = await this.prisma.funcionarios_cursos.count({
      where: { id: { in: unicos }, curso_id: cursoId },
    });
    if (delCurso !== unicos.length) throw new NotFoundException(CONFIG.noEncontrado);
  }
}

import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { hoyUruguay } from '../../lib/fechas';
import {
  AlcanceResuelto,
  subUnidadIdsDeAlcance,
} from '../../lib/alcance/alcance.types';
import {
  assertCursoGestionableEnAlcance,
  assertCursoVisibleEnAlcance,
  whereCursosVisiblesPorAlcance,
} from '../../lib/alcance/alcance.where';
import { CursoDto } from './dto/curso.dto';
import { assertPersonasCursos } from './personas-cursos';
import { Prisma } from '@prisma/client';
import { ListCursosQueryDto } from './dto/list-cursos-query.dto';
import { CreateModuloCursoDto } from './dto/create-modulo-curso.dto';
import { MarcarCompletacionDto } from './dto/completacion-modulo.dto';
import { CursosPorFuncionarioQueryDto } from './dto/cursos-por-funcionario-query.dto';
import { CreateDesignacionDto } from './dto/create-designacion.dto';
import { UpdateCursoDto } from './dto/update-curso.dto';
import { UpdateDesignacionDto } from './dto/update-designacion.dto';
import { EditarInscripcionDto } from './dto/editar-inscripcion.dto';
import { CalificarDesignacionesDto } from './dto/calificar-designaciones.dto';
import { wherePersonaPorCategoria } from '../../lib/personal/categoria-personal';
import {
  ordenarPersonasPorDerechaNumor,
  tieneFiltroDerechaNumor,
  whereRelacionPorDerechaNumor,
} from '../../lib/personal/filtro-derecha-numor';
import { ArchivosService } from '../archivos/archivos.service';
import {
  INCLUDE_DOCUMENTOS,
  archivosDeFilas,
  type ArchivosFila,
  darDeBajaArchivos,
  documentosDe,
} from '../archivos/documentos-de-registro';
import { whereBusqueda } from '../../lib/query/busqueda';

/** Base del curso con su comando, o `null` si es general. */
function baseDelCurso(
  b: { id: bigint; denominacion: string; unidades: { denominacion: string } | null } | null,
) {
  return b ? { id: b.id.toString(), denominacion: b.denominacion, comando: b.unidades?.denominacion ?? null } : null;
}

@Injectable()
export class CursosService {
  private readonly logger = new Logger(CursosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: ArchivosService,
  ) {}

  async create(dto: CursoDto, alcance?: AlcanceResuelto) {
    const existe = await this.prisma.cursos.findFirst({
      where: { nombre_curso: { equals: dto.nombre_curso, mode: 'insensitive' } },
    });
    if (existe) {
      throw new ConflictException(
        `Ya existe un curso con nombre ${dto.nombre_curso}`,
      );
    }

    const base = await this.resolverBaseDelCurso(dto.sub_unidad_id, alcance);

    return this.prisma.$transaction(async (tx) => {
      const curso = await tx.cursos.create({
        data: {
          nombre_curso: dto.nombre_curso,
          institucion: dto.institucion,
          es_obligatorio: dto.es_obligatorio ?? true,
          // Curso de una base (el comando sale de ella) o general de la fuerza (ambos nulos).
          sub_unidad_id: base?.id ?? null,
          unidad_id: base?.unidad_id ?? null,
        },
      });

      return {
        id: curso.id.toString(),
        nombre_curso: curso.nombre_curso,
        institucion: curso.institucion,
        es_obligatorio: curso.es_obligatorio,
        unidad_id: curso.unidad_id ? curso.unidad_id.toString() : null,
        sub_unidad_id: curso.sub_unidad_id ? curso.sub_unidad_id.toString() : null,
      };
    });
  }

  /**
   * Base a la que queda asignado un curso nuevo.
   * - Alcance global: la que pida (o ninguna = curso general).
   * - Alcance de unidad: una de sus bases; si tiene una sola y no pidió ninguna, esa.
   *   No puede crear cursos generales.
   */
  private async resolverBaseDelCurso(subUnidadId: number | undefined, alcance?: AlcanceResuelto) {
    const propias = alcance ? subUnidadIdsDeAlcance(alcance) : null;

    let id: bigint | null = subUnidadId != null ? BigInt(subUnidadId) : null;
    if (propias !== null) {
      if (id === null) {
        if (propias.length !== 1) {
          throw new BadRequestException('Elegí la base del curso (sub_unidad_id)');
        }
        id = propias[0];
      } else if (!propias.includes(id)) {
        throw new ForbiddenException('Solo podés crear cursos de tus propias bases');
      }
    }
    if (id === null) return null;

    const base = await this.prisma.sub_unidades.findUnique({
      where: { id },
      select: { id: true, unidad_id: true, vigente: true },
    });
    if (!base) throw new BadRequestException('sub_unidad_id no existe en la tabla de sub-unidades');
    if (!base.vigente) throw new BadRequestException('La base elegida no está vigente');
    return base;
  }

  async findAll(query: ListCursosQueryDto = {}, alcance?: AlcanceResuelto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);

    const busqueda = [
      ...(whereBusqueda(query.nombre, ['nombre_curso'])?.AND ?? []),
      ...(whereBusqueda(query.institucion, ['institucion'])?.AND ?? []),
    ];
    const where = {
      ...(busqueda.length ? { AND: busqueda } : {}),
      ...(query.es_obligatorio !== undefined ? { es_obligatorio: query.es_obligatorio } : {}),
      // Alcance de unidad: cursos propios MAS los generales de la fuerza.
      ...(alcance ? whereCursosVisiblesPorAlcance(alcance) : {}),
    };

    const [total, cursos] = await this.prisma.$transaction([
      this.prisma.cursos.count({ where }),
      this.prisma.cursos.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          modulos_curso: {
            orderBy: { orden_modulo: 'asc' },
          },
          sub_unidades: { select: { id: true, denominacion: true, unidades: { select: { denominacion: true } } } },
        },
      }),
    ]);

    return {
      items: cursos.map((c) => ({
        id: c.id.toString(),
        nombre_curso: c.nombre_curso,
        institucion: c.institucion,
        es_obligatorio: c.es_obligatorio,
        base: baseDelCurso(c.sub_unidades),
        modulos_curso: c.modulos_curso.map((m) => ({
          id: m.id.toString(),
          curso_id: m.curso_id?.toString() ?? null,
          nombre_modulo: m.nombre_modulo,
          orden_modulo: m.orden_modulo,
          descripcion: m.descripcion,
        })),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: number, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoVisibleEnAlcance(this.prisma, BigInt(id), alcance);
    }

    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(id) },
      include: {
        modulos_curso: {
          orderBy: { orden_modulo: 'asc' },
        },
        sub_unidades: { select: { id: true, denominacion: true, unidades: { select: { denominacion: true } } } },
      },
    });

    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${id}`);
    }

    return {
      id: curso.id.toString(),
      nombre_curso: curso.nombre_curso,
      institucion: curso.institucion,
      es_obligatorio: curso.es_obligatorio,
      base: baseDelCurso(curso.sub_unidades),
      modulos_curso: curso.modulos_curso.map((m) => ({
        id: m.id.toString(),
        curso_id: m.curso_id?.toString() ?? null,
        nombre_modulo: m.nombre_modulo,
        orden_modulo: m.orden_modulo,
        descripcion: m.descripcion,
      })),
    };
  }

  async createModulo(cursoId: number, dto: CreateModuloCursoDto, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(cursoId) },
    });

    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${cursoId}`);
    }

    const modulo = await this.prisma.modulos_curso.create({
      data: {
        curso_id: BigInt(cursoId),
        nombre_modulo: dto.nombre_modulo,
        orden_modulo: dto.orden_modulo,
        descripcion: dto.descripcion,
      },
    });

    return {
      id: modulo.id.toString(),
      curso_id: modulo.curso_id?.toString() ?? null,
      nombre_modulo: modulo.nombre_modulo,
      orden_modulo: modulo.orden_modulo,
      descripcion: modulo.descripcion,
    };
  }

  async removeCurso(id: number, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(id), alcance);
    }

    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(id) },
    });

    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${id}`);
    }

    const archivos = await this.prisma.$transaction(async (tx) => {
      // Padre primero: una inscripción nueva necesita KEY SHARE sobre el curso y espera hasta el commit.
      await tx.$queryRaw`SELECT id FROM cursos WHERE id = ${curso.id} FOR UPDATE`;
      const designaciones = await tx.$queryRaw<ArchivosFila[]>`
        SELECT archivo_orden_id, archivo_boletin_id FROM funcionarios_cursos WHERE curso_id = ${curso.id} FOR UPDATE`;
      // Borra inscripciones (cascada sus filas de módulo) para no violar las FK.
      await tx.funcionarios_cursos.deleteMany({ where: { curso_id: curso.id } });
      // Borra el curso (cascada las definiciones de módulos_curso).
      await tx.cursos.delete({ where: { id: curso.id } });
      return archivosDeFilas(designaciones);
    });
    await darDeBajaArchivos(this.archivos, archivos, null, this.logger);

    return { id: id.toString(), eliminado: true };
  }

  async getCursosPorFuncionario(query: CursosPorFuncionarioQueryDto, alcance: AlcanceResuelto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);
    const cursosFilter = whereCursosVisiblesPorAlcance(alcance);
    const filtroDerecha = tieneFiltroDerechaNumor(query);
    const where = {
      ...(query.cedula || query.categoria || filtroDerecha
        ? {
            personas: {
              ...(query.cedula ? { cedula: query.cedula } : {}),
              ...wherePersonaPorCategoria(query.categoria),
              ...(filtroDerecha && {
                relaciones_laborales: {
                  some: { fecha_fin: null, ...whereRelacionPorDerechaNumor(query) },
                },
              }),
            },
          }
        : {}),
      ...(query.incluir_bajas ? {} : { dado_de_baja: false }),
      ...(Object.keys(cursosFilter).length > 0 ? { cursos: cursosFilter } : {}),
    };

    // Se ordena por la derecha (o numor, o apellido) de la persona y después por curso.
    const todos = await this.prisma.funcionarios_cursos.findMany({
      where,
      select: { id: true, persona_id: true, curso_id: true },
    });
    const ordenPersonas = await ordenarPersonasPorDerechaNumor(
      this.prisma,
      [...new Set(todos.map((r) => r.persona_id))],
      query,
    );
    const posicion = new Map(ordenPersonas.map((id, i) => [id.toString(), i]));
    const pagina = todos
      .sort(
        (a, b) =>
          posicion.get(a.persona_id.toString())! - posicion.get(b.persona_id.toString())! ||
          (a.curso_id < b.curso_id ? -1 : a.curso_id > b.curso_id ? 1 : 0),
      )
      .slice((page - 1) * pageSize, page * pageSize)
      .map((r) => r.id);
    const total = todos.length;

    const filas = await this.prisma.funcionarios_cursos.findMany({
      where: { id: { in: pagina } },
      include: {
        personas: {
          select: {
            id: true,
            cedula: true,
            primer_nombre: true,
            segundo_nombre: true,
            primer_apellido: true,
            segundo_apellido: true,
            relaciones_laborales: {
              where: { fecha_fin: null },
              take: 1,
              select: {
                derecha: true,
                numor: true,
                grados: { select: { denominacion: true } },
                escalafones: { select: { codigo: true } },
              },
            },
          },
        },
        cursos: {
          select: {
            id: true,
            nombre_curso: true,
            institucion: true,
            es_obligatorio: true,
            sub_unidad_id: true,
          },
        },
        modulos: {
          include: {
            modulos_curso: {
              select: { id: true, nombre_modulo: true, orden_modulo: true },
            },
          },
        },
        usuarios: {
          select: { id: true, username: true },
        },
        ...INCLUDE_DOCUMENTOS,
      },
    });
    const porId = new Map(filas.map((r) => [r.id.toString(), r]));
    const registros = pagina.flatMap((id) => porId.get(id.toString()) ?? []);

    return {
      items: registros.map((r) => ({
      id: r.id.toString(),
      persona: {
        id: r.personas.id.toString(),
        cedula: r.personas.cedula,
        primer_nombre: r.personas.primer_nombre,
        segundo_nombre: r.personas.segundo_nombre,
        primer_apellido: r.personas.primer_apellido,
        segundo_apellido: r.personas.segundo_apellido,
        grado: r.personas.relaciones_laborales[0]?.grados.denominacion ?? null,
        escalafon: r.personas.relaciones_laborales[0]?.escalafones.codigo ?? null,
        derecha: r.personas.relaciones_laborales[0]?.derecha ?? null,
        numor: r.personas.relaciones_laborales[0]?.numor ?? null,
      },
      curso: {
        id: r.cursos.id.toString(),
        nombre_curso: r.cursos.nombre_curso,
        institucion: r.cursos.institucion,
        es_obligatorio: r.cursos.es_obligatorio,
        sub_unidad_id: r.cursos.sub_unidad_id,
      },
      numero_orden: r.numero_orden,
      boletin: r.boletin,
      fecha_inicio: r.fecha_inicio,
      fecha_fin: r.fecha_fin,
      aprobado: r.aprobado,
      calificacion: r.calificacion !== null && r.calificacion !== undefined ? Number(r.calificacion) : null,
      observacion: r.observacion_calificacion,
      dado_de_baja: r.dado_de_baja,
      motivo_baja: r.motivo_baja,
      fecha_baja: r.fecha_baja,
      dado_de_baja_por: r.usuarios
        ? { id: r.usuarios.id.toString(), username: r.usuarios.username }
        : null,
      modulos: r.modulos.map((m) => ({
        id: m.id.toString(),
        modulo_id: m.modulo_id.toString(),
        nombre_modulo: m.modulos_curso.nombre_modulo,
        orden_modulo: m.modulos_curso.orden_modulo,
        numero_orden: m.numero_orden,
        boletin: m.boletin,
        completado: m.completado,
        fecha_finalizacion: m.fecha_finalizacion,
        aprobado: m.aprobado,
        calificacion: m.calificacion !== null && m.calificacion !== undefined ? Number(m.calificacion) : null,
        observacion: m.observacion_calificacion,
      })),
      documentos: documentosDe(r),
    })),
      total,
      page,
      pageSize,
    };
  }

  async marcarCompletacion(cursoId: number, moduloId: number, dto: MarcarCompletacionDto, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    const modulo = await this.prisma.modulos_curso.findFirst({
      where: { id: BigInt(moduloId), curso_id: BigInt(cursoId) },
    });
    if (!modulo) {
      throw new NotFoundException(
        `No existe módulo con id ${moduloId} para el curso ${cursoId}`,
      );
    }

    const campos = this.camposCompletacion(dto);
    const completacion = await this.prisma.$transaction(async (tx) => {
      await assertPersonasCursos(tx, [BigInt(dto.persona_id)], alcance);
      // 1) Asegurar la inscripción al curso (padre). Si no existe, se crea.
      const inscripcion = await tx.funcionarios_cursos.upsert({
        where: {
          persona_id_curso_id: {
            persona_id: BigInt(dto.persona_id),
            curso_id: BigInt(cursoId),
          },
        },
        create: {
          persona_id: BigInt(dto.persona_id),
          curso_id: BigInt(cursoId),
        },
        update: {},
      });

      await tx.$queryRaw`SELECT id FROM funcionarios_cursos WHERE id = ${inscripcion.id} FOR UPDATE`;
      const actual = await tx.funcionarios_cursos.findFirst({ where: { id: inscripcion.id } });
      if (!actual) throw new NotFoundException('No existe la inscripción');
      if (actual.dado_de_baja) throw new ConflictException('La inscripción está dada de baja; reactivala antes de calificar o completar módulos');

      // 2) Marcar/actualizar el detalle del módulo (hijo) con su orden/resolución.
      return tx.funcionarios_modulos_curso.upsert({
        where: {
          funcionario_curso_id_modulo_id: {
            funcionario_curso_id: inscripcion.id,
            modulo_id: BigInt(moduloId),
          },
        },
        create: {
          funcionario_curso_id: inscripcion.id,
          modulo_id: BigInt(moduloId),
          completado: false,
          fecha_finalizacion: null,
          aprobado: null,
          calificacion: null,
          observacion_calificacion: null,
          numero_orden: null,
          boletin: null,
          ...campos,
        },
        update: campos,
      });
    });

    return {
      id: completacion.id.toString(),
      funcionario_curso_id: completacion.funcionario_curso_id.toString(),
      modulo_id: completacion.modulo_id.toString(),
      completado: completacion.completado,
      fecha_finalizacion: completacion.fecha_finalizacion,
      aprobado: completacion.aprobado,
      calificacion: completacion.calificacion != null ? Number(completacion.calificacion) : null,
      observacion: completacion.observacion_calificacion,
      numero_orden: completacion.numero_orden,
      boletin: completacion.boletin,
    };
  }

  async getCompletacionesModulo(cursoId: number, moduloId: number, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoVisibleEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    const modulo = await this.prisma.modulos_curso.findFirst({
      where: { id: BigInt(moduloId), curso_id: BigInt(cursoId) },
    });
    if (!modulo) {
      throw new NotFoundException(
        `No existe módulo con id ${moduloId} para el curso ${cursoId}`,
      );
    }

    const completaciones = await this.prisma.funcionarios_modulos_curso.findMany({
      where: { modulo_id: BigInt(moduloId) },
      include: {
        funcionarios_cursos: {
          include: {
            personas: { select: { id: true, primer_nombre: true, primer_apellido: true } },
          },
        },
      },
    });

    return completaciones.map((c) => ({
      persona_id: c.funcionarios_cursos.personas.id.toString(),
      primer_nombre: c.funcionarios_cursos.personas.primer_nombre,
      primer_apellido: c.funcionarios_cursos.personas.primer_apellido,
      completado: c.completado,
      fecha_finalizacion: c.fecha_finalizacion,
      aprobado: c.aprobado,
      calificacion: c.calificacion != null ? Number(c.calificacion) : null,
      observacion: c.observacion_calificacion,
      numero_orden: c.numero_orden,
      boletin: c.boletin,
    }));
  }

  async removeModuloCurso(cursoId: number, moduloId: number, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(cursoId) },
    });

    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${cursoId}`);
    }

    const modulo = await this.prisma.modulos_curso.findFirst({
      where: {
        id: BigInt(moduloId),
        curso_id: BigInt(cursoId),
      },
    });

    if (!modulo) {
      throw new NotFoundException(
        `No existe módulo con id ${moduloId} para el curso ${cursoId}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const participaciones = await tx.funcionarios_modulos_curso.findMany({
        where: { modulo_id: modulo.id },
        include: { funcionarios_cursos: { select: { id: true, numero_orden: true, boletin: true } } },
      });
      // Si la inscripción no tiene orden ni resolución, se queda con los del módulo
      for (const p of participaciones) {
        const insc = p.funcionarios_cursos;
        if (insc.numero_orden || insc.boletin || (!p.numero_orden && !p.boletin)) continue;
        await tx.funcionarios_cursos.update({
          where: { id: insc.id },
          data: { numero_orden: p.numero_orden, boletin: p.boletin },
        });
      }
      // Borrar primero las participaciones del módulo (no hay cascade en esa FK).
      await tx.funcionarios_modulos_curso.deleteMany({ where: { modulo_id: modulo.id } });
      await tx.modulos_curso.delete({ where: { id: modulo.id } });
    });

    return {
      curso_id: cursoId.toString(),
      modulo_id: moduloId.toString(),
      eliminado: true,
    };
  }

  // ─── Editar curso ─────────────────────────────────────────────────────────
  async editarCurso(id: number, dto: UpdateCursoDto, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(id), alcance);
    }

    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(id) },
    });
    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${id}`);
    }

    if (dto.nombre_curso && dto.nombre_curso !== curso.nombre_curso) {
      const dup = await this.prisma.cursos.findFirst({
        where: {
          nombre_curso: { equals: dto.nombre_curso, mode: 'insensitive' },
          id: { not: BigInt(id) },
        },
      });
      if (dup) {
        throw new ConflictException(
          `Ya existe un curso con nombre ${dto.nombre_curso}`,
        );
      }
    }

    const actualizado = await this.prisma.cursos.update({
      where: { id: BigInt(id) },
      data: {
        nombre_curso: dto.nombre_curso ?? undefined,
        institucion: dto.institucion ?? undefined,
        es_obligatorio: dto.es_obligatorio ?? undefined,
      },
    });

    return {
      id: actualizado.id.toString(),
      nombre_curso: actualizado.nombre_curso,
      institucion: actualizado.institucion,
      es_obligatorio: actualizado.es_obligatorio,
    };
  }

  // ─── Designar / Dictar (crear una instancia) ──────────────────────────────
  async crearDesignacion(cursoId: number, dto: CreateDesignacionDto, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    const curso = await this.prisma.cursos.findUnique({
      where: { id: BigInt(cursoId) },
    });
    if (!curso) {
      throw new NotFoundException(`No existe curso con id ${cursoId}`);
    }

    const moduloIds = [...new Set(dto.modulo_ids ?? [])];
    const personaIds = [...new Set(dto.persona_ids)];
    if (moduloIds.length) {
      const count = await this.prisma.modulos_curso.count({
        where: {
          id: { in: moduloIds.map((m) => BigInt(m)) },
          curso_id: BigInt(cursoId),
        },
      });
      if (count !== moduloIds.length) {
        throw new NotFoundException(
          'Uno o más módulos no pertenecen a este curso',
        );
      }
    }

    const fechaInicio = new Date(dto.fecha_inicio);
    const fechaFin = new Date(dto.fecha_fin);
    if (fechaFin < fechaInicio) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la fecha de inicio');
    }
    const aNivelModulo = moduloIds.length > 0;

    const designaciones: { id: bigint; persona_id: bigint }[] = [];
    try { await this.prisma.$transaction(async (tx) => {
      const ids = personaIds.map(BigInt);
      await assertPersonasCursos(tx, ids, alcance);
      const existente = await tx.funcionarios_cursos.findFirst({ where: { curso_id: BigInt(cursoId), persona_id: { in: ids } } });
      if (existente) throw new ConflictException('Una o más personas ya tienen una inscripción en este curso. No se puede sobrescribir su historial; la reactivación de una baja es una acción separada.');
      for (const personaId of personaIds) {
        const inscripcion = await tx.funcionarios_cursos.create({
          data: {
            persona_id: BigInt(personaId),
            curso_id: BigInt(cursoId),
            // A nivel módulo, la orden/resolución van en las filas de módulo.
            numero_orden: aNivelModulo ? null : (dto.numero_orden ?? null),
            boletin: aNivelModulo ? null : (dto.boletin ?? null),
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
          },
        });
        designaciones.push({ id: inscripcion.id, persona_id: inscripcion.persona_id });

        for (const moduloId of moduloIds) {
          await tx.funcionarios_modulos_curso.upsert({
            where: {
              funcionario_curso_id_modulo_id: {
                funcionario_curso_id: inscripcion.id,
                modulo_id: BigInt(moduloId),
              },
            },
            create: {
              funcionario_curso_id: inscripcion.id,
              modulo_id: BigInt(moduloId),
              numero_orden: dto.numero_orden ?? null,
              boletin: dto.boletin ?? null,
              completado: false,
              fecha_finalizacion: null,
            },
            update: {
              numero_orden: dto.numero_orden ?? null,
              boletin: dto.boletin ?? null,
            },
          });
        }
      }
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una inscripción para esa persona y curso');
      }
      throw error;
    }

    return {
      curso_id: cursoId.toString(),
      personas_designadas: personaIds.length,
      modulos_designados: moduloIds.length,
      numero_orden: dto.numero_orden ?? null,
      boletin: dto.boletin ?? null,
      designaciones,
    };
  }

  async actualizarDesignacion(cursoId: number, designacionId: number, dto: UpdateDesignacionDto, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    return this.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM funcionarios_cursos WHERE id = ${BigInt(designacionId)} AND curso_id = ${BigInt(cursoId)} FOR UPDATE`;
    const designacion = await tx.funcionarios_cursos.findFirst({
      where: { id: BigInt(designacionId), curso_id: BigInt(cursoId) },
    });
    if (!designacion) {
      throw new NotFoundException(
        `No existe designación con id ${designacionId} para el curso ${cursoId}`,
      );
    }

    await assertPersonasCursos(tx, [designacion.persona_id], alcance);
    if (designacion.dado_de_baja) throw new ConflictException('La inscripción está dada de baja; reactivala antes de calificar');
    const actualizado = await tx.funcionarios_cursos.update({
      where: { id: BigInt(designacionId) },
      data: this.datosCalificacion(dto),
    });

    return this.toCalificacionResponse(actualizado);
    });
  }

  // ─── Editar inscripción ────────────────────────────────────────────────────
  // Corrige orden, resolución, fechas y resultado. Un campo ausente no se toca; en null se vacía.
  async editarInscripcion(cursoId: number, designacionId: number, dto: EditarInscripcionDto, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM funcionarios_cursos WHERE id = ${BigInt(designacionId)} AND curso_id = ${BigInt(cursoId)} FOR UPDATE`;
      const actual = await tx.funcionarios_cursos.findFirst({
        where: { id: BigInt(designacionId), curso_id: BigInt(cursoId) },
      });
      if (!actual) {
        throw new NotFoundException(`No existe designación con id ${designacionId} para el curso ${cursoId}`);
      }
      await assertPersonasCursos(tx, [actual.persona_id], alcance);
      if (actual.dado_de_baja) {
        throw new ConflictException('La inscripción está dada de baja; reactivala antes de editarla');
      }

      const texto = (v: string | null | undefined) => (v == null ? null : v.trim() || null);
      const fecha = (v: string | null | undefined) => (v ? new Date(v) : null);
      const data: Prisma.funcionarios_cursosUpdateInput = {};

      if (dto.numero_orden !== undefined) data.numero_orden = texto(dto.numero_orden);
      if (dto.boletin !== undefined) data.boletin = texto(dto.boletin);
      // Igual que al designar: si se tocan, tiene que quedar al menos uno de los dos.
      if (dto.numero_orden !== undefined || dto.boletin !== undefined) {
        const orden = dto.numero_orden !== undefined ? data.numero_orden : actual.numero_orden;
        const boletin = dto.boletin !== undefined ? data.boletin : actual.boletin;
        if (!orden && !boletin) {
          throw new BadRequestException('Indicá el número de orden o la resolución');
        }
      }

      if (dto.fecha_inicio !== undefined) data.fecha_inicio = fecha(dto.fecha_inicio);
      if (dto.fecha_fin !== undefined) data.fecha_fin = fecha(dto.fecha_fin);
      const inicio = dto.fecha_inicio !== undefined ? fecha(dto.fecha_inicio) : actual.fecha_inicio;
      const fin = dto.fecha_fin !== undefined ? fecha(dto.fecha_fin) : actual.fecha_fin;
      if (inicio && fin && fin < inicio) {
        throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio');
      }

      if (dto.aprobado !== undefined) {
        data.aprobado = dto.aprobado;
        if (dto.aprobado === null) {
          // Sin resultado no queda nota ni observación colgando.
          data.calificacion = null;
          data.observacion_calificacion = null;
        }
      }
      if (dto.aprobado !== null) {
        const aprobado = dto.aprobado !== undefined ? dto.aprobado : actual.aprobado;
        if (aprobado === null && (dto.calificacion != null || dto.observacion != null)) {
          throw new BadRequestException('Indicá si aprobó o no antes de cargar la nota u observación');
        }
        Object.assign(data, this.camposNota(dto));
      }

      // El resultado solo se carga con el curso terminado: fecha de fin anterior a hoy (igual que "Cargar resultado").
      const aprobadoFinal = dto.aprobado !== undefined ? dto.aprobado : actual.aprobado;
      const tocaResultado = [dto.aprobado, dto.calificacion, dto.observacion, dto.fecha_fin].some((v) => v !== undefined);
      if (tocaResultado && aprobadoFinal !== null && !(fin && fin < hoyUruguay())) {
        throw new BadRequestException(
          'El curso todavía no terminó: el resultado se carga cuando pasa la fecha de fin',
        );
      }

      const r = await tx.funcionarios_cursos.update({ where: { id: BigInt(designacionId) }, data });
      return {
        id: r.id.toString(),
        curso_id: r.curso_id.toString(),
        persona_id: r.persona_id.toString(),
        numero_orden: r.numero_orden,
        boletin: r.boletin,
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        aprobado: r.aprobado,
        calificacion: r.calificacion != null ? Number(r.calificacion) : null,
        observacion: r.observacion_calificacion,
      };
    });
  }

  // Todo o nada: si una designación no es del curso o falla un update, no se guarda ninguna.
  async calificarDesignaciones(cursoId: number, dto: CalificarDesignacionesDto, alcance?: AlcanceResuelto) {
    const ids = dto.resultados.map((r) => r.designacionId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Hay designaciones repetidas en la calificación');
    }

    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    const existentes = await this.prisma.funcionarios_cursos.findMany({
      where: { id: { in: ids.map((id) => BigInt(id)) }, curso_id: BigInt(cursoId) },
      select: { id: true },
    });
    if (existentes.length !== ids.length) {
      const encontradas = new Set(existentes.map((d) => Number(d.id)));
      const faltantes = ids.filter((id) => !encontradas.has(id));
      throw new NotFoundException(
        `No existen designaciones con id ${faltantes.join(', ')} para el curso ${cursoId}`,
      );
    }

    const actualizadas = await this.prisma.$transaction(
      dto.resultados.map((r) =>
        this.prisma.funcionarios_cursos.update({
          where: { id: BigInt(r.designacionId) },
          data: this.datosCalificacion(r),
        }),
      ),
    );

    return actualizadas.map((d) => this.toCalificacionResponse(d));
  }

  private datosCalificacion(dto: UpdateDesignacionDto) {
    return { aprobado: dto.aprobado, ...this.camposNota(dto) };
  }

  private camposCompletacion(dto: MarcarCompletacionDto) {
    return {
      ...(dto.completado != null && { completado: dto.completado }),
      ...(dto.fecha_finalizacion !== undefined && {
        fecha_finalizacion: dto.fecha_finalizacion ? new Date(dto.fecha_finalizacion) : null,
      }),
      ...(dto.aprobado !== undefined && { aprobado: dto.aprobado }),
      ...this.camposNota(dto),
      ...(dto.numero_orden !== undefined && { numero_orden: dto.numero_orden }),
      ...(dto.boletin !== undefined && { boletin: dto.boletin }),
    };
  }

  // Un campo ausente no se toca (recalificar no pisa lo anterior); en null se vacía.
  private camposNota(dto: { calificacion?: number | null; observacion?: string | null }) {
    return {
      ...(dto.calificacion !== undefined && { calificacion: dto.calificacion?.toString() ?? null }),
      ...(dto.observacion !== undefined && { observacion_calificacion: dto.observacion }),
    };
  }

  private toCalificacionResponse(d: {
    id: bigint;
    curso_id: bigint;
    persona_id: bigint;
    aprobado: boolean | null;
    calificacion: unknown;
    observacion_calificacion: string | null;
  }) {
    return {
      id: d.id.toString(),
      curso_id: d.curso_id.toString(),
      persona_id: d.persona_id.toString(),
      aprobado: d.aprobado,
      calificacion: d.calificacion != null ? Number(d.calificacion) : null,
      observacion: d.observacion_calificacion,
    };
  }

  // ─── Dar de baja (baja lógica con motivo) ──────────────────────────────────
  async darDeBajaDesignacion(
    cursoId: number,
    designacionId: number,
    motivo: string,
    usuarioId: string,
    alcance?: AlcanceResuelto,
  ) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    const designacion = await this.prisma.funcionarios_cursos.findFirst({
      where: { id: BigInt(designacionId), curso_id: BigInt(cursoId) },
    });
    if (!designacion) {
      throw new NotFoundException(
        `No existe designación con id ${designacionId} para el curso ${cursoId}`,
      );
    }
    if (designacion.dado_de_baja) {
      throw new ConflictException('La inscripción ya está dada de baja.');
    }

    const actualizado = await this.prisma.funcionarios_cursos.update({
      where: { id: BigInt(designacionId) },
      data: {
        dado_de_baja: true,
        motivo_baja: motivo,
        fecha_baja: new Date(),
        dado_de_baja_por: BigInt(usuarioId),
      },
    });

    return {
      id: actualizado.id.toString(),
      curso_id: actualizado.curso_id.toString(),
      persona_id: actualizado.persona_id.toString(),
      dado_de_baja: actualizado.dado_de_baja,
      motivo_baja: actualizado.motivo_baja,
      fecha_baja: actualizado.fecha_baja,
    };
  }

  // ─── Reactivar (revertir la baja) ──────────────────────────────────────────
  async reactivarDesignacion(cursoId: number, designacionId: number, alcance?: AlcanceResuelto) {
    if (alcance) {
      await assertCursoGestionableEnAlcance(this.prisma, BigInt(cursoId), alcance);
    }

    const designacion = await this.prisma.funcionarios_cursos.findFirst({
      where: { id: BigInt(designacionId), curso_id: BigInt(cursoId) },
    });
    if (!designacion) {
      throw new NotFoundException(
        `No existe designación con id ${designacionId} para el curso ${cursoId}`,
      );
    }
    if (!designacion.dado_de_baja) {
      throw new ConflictException('La inscripción no está dada de baja.');
    }

    const actualizado = await this.prisma.funcionarios_cursos.update({
      where: { id: BigInt(designacionId) },
      data: {
        dado_de_baja: false,
        motivo_baja: null,
        fecha_baja: null,
        dado_de_baja_por: null,
      },
    });

    return {
      id: actualizado.id.toString(),
      curso_id: actualizado.curso_id.toString(),
      persona_id: actualizado.persona_id.toString(),
      dado_de_baja: actualizado.dado_de_baja,
    };
  }

}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../lib/prisma.service.js';
import { CreateReglaDto } from './dto/create-regla.dto.js';
import { UpdateReglaDto } from './dto/update-regla.dto.js';
import { ListReglasQueryDto } from './dto/list-reglas-query.dto.js';
import { ReglaRequisitoDto } from './dto/regla-requisito.dto.js';
import { ESCALERA_FAU } from './ascensos.constants.js';

const soloFecha = (fecha: Date | null | undefined) =>
  fecha ? fecha.toISOString().split('T')[0] : null;

const hoy = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const includeRegla = {
  grado_origen: { select: { id: true, codigo: true, denominacion: true, orden: true } },
  grado_destino: { select: { id: true, codigo: true, denominacion: true, orden: true } },
  usuario: { select: { id: true, username: true } },
  requisitos: {
    orderBy: { orden: 'asc' as const },
    include: {
      cursos: {
        include: {
          curso: { select: { id: true, nombre_curso: true, institucion: true } },
        },
      },
    },
  },
} satisfies Prisma.ascensos_reglasInclude;

type ReglaConTodo = Prisma.ascensos_reglasGetPayload<{ include: typeof includeRegla }>;

/**
 * ABM de las reglas de ascenso, con versionado por vigencia: editar no
 * sobreescribe, cierra la versión vigente y crea una nueva, para que cada
 * ascenso histórico pueda seguir señalando la versión que se le aplicó.
 *
 * Viven en `ascensos_reglas`, no en `reglas_ascenso`, que es del sistema de
 * liquidación y queda vacía.
 */
@Injectable()
export class ReglasAscensoService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Lectura ──────────────────────────────────────────────────────────────

  /**
   * Una columna por escalafón y un escalón por tramo. Los tramos sin regla se
   * devuelven igual, con `regla: null`, para que se vea lo que falta cargar.
   */
  async listarEscalera(query: ListReglasQueryDto = {}) {
    const incluirInactivas = query.incluir_inactivas ?? true;

    const codigos = ESCALERA_FAU.flatMap((g) => [...g.grados]);

    const [grados, reglas, dotacion] = await Promise.all([
      this.prisma.grados.findMany({
        where: { codigo: { in: codigos } },
        select: { id: true, codigo: true, denominacion: true, orden: true },
      }),
      this.prisma.ascensos_reglas.findMany({
        where: {
          vigente_hasta: null,
          ...(incluirInactivas ? {} : { activo: true }),
        },
        include: includeRegla,
      }),
      this.prisma.relaciones_laborales.groupBy({
        by: ['grado_id'],
        where: { fecha_fin: null },
        _count: { _all: true },
      }),
    ]);

    const porCodigo = new Map(grados.map((g) => [g.codigo, g]));
    const reglaPorOrigen = new Map(reglas.map((r) => [r.grado_origen_id.toString(), r]));
    const dotacionPorGrado = new Map(
      dotacion.map((d) => [d.grado_id.toString(), d._count._all]),
    );

    const versionesPorOrigen = query.incluir_versiones
      ? await this.versionesPorOrigen(reglas.map((r) => r.grado_origen_id))
      : new Map<string, ReglaConTodo[]>();

    const usados = new Set<string>();

    const grupos = ESCALERA_FAU.map((grupo) => {
      const escalones = grupo.grados.flatMap((codigo, i) => {
        const origen = porCodigo.get(codigo);
        if (!origen) return [];

        const regla = reglaPorOrigen.get(origen.id.toString()) ?? null;
        if (regla) usados.add(regla.id.toString());

        const siguiente = grupo.grados[i + 1]
          ? (porCodigo.get(grupo.grados[i + 1]) ?? null)
          : null;

        // Sin regla y sin grado siguiente es el tope de la escala.
        if (!regla && !siguiente) return [];

        return [
          {
            grado_origen: origen,
            grado_destino: regla?.grado_destino ?? siguiente,
            funcionarios_en_grado: dotacionPorGrado.get(origen.id.toString()) ?? 0,
            regla: regla
              ? this.mapRegla(regla, versionesPorOrigen.get(origen.id.toString()))
              : null,
          },
        ];
      });

      return { clave: grupo.clave, nombre: grupo.nombre, escalones };
    });

    // Reglas cargadas a mano sobre grados fuera de la escala.
    const fueraDeEscala = reglas.filter((r) => !usados.has(r.id.toString()));
    if (fueraDeEscala.length > 0) {
      grupos.push({
        clave: 'OTROS' as never,
        nombre: 'Otros tramos cargados a mano' as never,
        escalones: fueraDeEscala.map((r) => ({
          grado_origen: r.grado_origen,
          grado_destino: r.grado_destino,
          funcionarios_en_grado: dotacionPorGrado.get(r.grado_origen_id.toString()) ?? 0,
          regla: this.mapRegla(r, versionesPorOrigen.get(r.grado_origen_id.toString())),
        })),
      });
    }

    return {
      grupos,
      stats: {
        tramos_con_regla: reglas.length,
        tramos_activos: reglas.filter((r) => r.activo).length,
        reglas_modificadas: reglas.filter((r) => !r.es_por_defecto).length,
      },
    };
  }

  /**
   * Para el multi-select del editor. Va acá y no en el módulo de cursos para que
   * quien administra las reglas no necesite además el permiso `cursos.ver`.
   */
  async listarCursosDelCatalogo() {
    const cursos = await this.prisma.cursos.findMany({
      orderBy: { nombre_curso: 'asc' },
      select: { id: true, nombre_curso: true, institucion: true },
    });
    return cursos.map((c) => ({
      id: c.id,
      nombre_curso: c.nombre_curso,
      institucion: c.institucion,
    }));
  }

  async obtener(id: number) {
    const regla = await this.prisma.ascensos_reglas.findUnique({
      where: { id: BigInt(id) },
      include: includeRegla,
    });
    if (!regla) throw new NotFoundException(`No existe la regla de ascenso ${id}`);

    const versiones = await this.versionesPorOrigen([regla.grado_origen_id]);
    return this.mapRegla(regla, versiones.get(regla.grado_origen_id.toString()));
  }

  /** Versiones del tramo, de la más nueva a la más vieja. */
  async listarVersiones(id: number) {
    const regla = await this.prisma.ascensos_reglas.findUnique({
      where: { id: BigInt(id) },
      select: { grado_origen_id: true },
    });
    if (!regla) throw new NotFoundException(`No existe la regla de ascenso ${id}`);

    const versiones = await this.prisma.ascensos_reglas.findMany({
      where: { grado_origen_id: regla.grado_origen_id },
      orderBy: [{ vigente_desde: 'desc' }, { id: 'desc' }],
      include: includeRegla,
    });
    return versiones.map((v) => this.mapRegla(v));
  }

  // ─── Escritura ────────────────────────────────────────────────────────────

  async crear(dto: CreateReglaDto, usuarioId?: bigint | null) {
    await this.assertGrados(dto.grado_origen_id, dto.grado_destino_id);

    const origenId = BigInt(dto.grado_origen_id);
    const vigente = await this.prisma.ascensos_reglas.findFirst({
      where: { grado_origen_id: origenId, vigente_hasta: null, activo: true },
      select: { id: true, nombre: true },
    });
    if (vigente) {
      throw new ConflictException(
        `Ese grado de origen ya tiene una regla vigente ("${vigente.nombre}"). Editala en vez de crear otra.`,
      );
    }

    const creada = await this.prisma.$transaction(async (tx) => {
      const regla = await tx.ascensos_reglas.create({
        data: {
          nombre: dto.nombre,
          grado_origen_id: origenId,
          grado_destino_id: BigInt(dto.grado_destino_id),
          dias_minimos: dto.dias_minimos,
          edad_maxima: dto.edad_maxima ?? null,
          notas: dto.notas ?? null,
          activo: dto.activo ?? true,
          es_por_defecto: false,
          vigente_desde: hoy(),
          actualizado_por: usuarioId ?? null,
        },
      });
      await this.crearRequisitos(tx, regla.id, dto.requisitos ?? []);
      return regla;
    });

    return this.obtener(Number(creada.id));
  }

  /** Lo que no venga en el DTO se copia de la versión anterior, requisitos incluidos. */
  async editar(id: number, dto: UpdateReglaDto, usuarioId?: bigint | null) {
    const actual = await this.prisma.ascensos_reglas.findUnique({
      where: { id: BigInt(id) },
      include: includeRegla,
    });
    if (!actual) throw new NotFoundException(`No existe la regla de ascenso ${id}`);
    if (actual.vigente_hasta !== null) {
      throw new ConflictException(
        'Esa versión de la regla ya está cerrada. Editá la versión vigente del tramo.',
      );
    }

    if (dto.grado_destino_id !== undefined) {
      await this.assertGrados(Number(actual.grado_origen_id), dto.grado_destino_id);
    }

    const nueva = await this.prisma.$transaction(async (tx) => {
      const fecha = hoy();

      await tx.ascensos_reglas.update({
        where: { id: actual.id },
        data: { vigente_hasta: fecha, actualizado_por: usuarioId ?? null, actualizado_en: new Date() },
      });

      const creada = await tx.ascensos_reglas.create({
        data: {
          nombre: dto.nombre ?? actual.nombre,
          grado_origen_id: actual.grado_origen_id,
          grado_destino_id:
            dto.grado_destino_id !== undefined
              ? BigInt(dto.grado_destino_id)
              : actual.grado_destino_id,
          dias_minimos: dto.dias_minimos ?? actual.dias_minimos,
          edad_maxima: dto.edad_maxima !== undefined ? dto.edad_maxima : actual.edad_maxima,
          notas: dto.notas !== undefined ? dto.notas : actual.notas,
          activo: dto.activo ?? actual.activo,
          // Deja de ser la versión de la FAU, y por eso se puede restaurar.
          es_por_defecto: false,
          vigente_desde: fecha,
          actualizado_por: usuarioId ?? null,
        },
      });

      const requisitos =
        dto.requisitos ?? actual.requisitos.map((r) => this.requisitoADto(r));
      await this.crearRequisitos(tx, creada.id, requisitos);

      return creada;
    });

    return this.obtener(Number(nueva.id));
  }

  /** No cierra la versión: el motor la ignora pero el tramo sigue visible. */
  async desactivar(id: number, usuarioId?: bigint | null) {
    const regla = await this.prisma.ascensos_reglas.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, activo: true, vigente_hasta: true },
    });
    if (!regla) throw new NotFoundException(`No existe la regla de ascenso ${id}`);
    if (regla.vigente_hasta !== null) {
      throw new ConflictException('Esa versión de la regla ya está cerrada');
    }
    if (!regla.activo) {
      throw new ConflictException('La regla ya está desactivada');
    }

    await this.prisma.ascensos_reglas.update({
      where: { id: regla.id },
      data: { activo: false, actualizado_por: usuarioId ?? null, actualizado_en: new Date() },
    });

    return this.obtener(id);
  }

  async activar(id: number, usuarioId?: bigint | null) {
    const regla = await this.prisma.ascensos_reglas.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, activo: true, vigente_hasta: true, grado_origen_id: true },
    });
    if (!regla) throw new NotFoundException(`No existe la regla de ascenso ${id}`);
    if (regla.vigente_hasta !== null) {
      throw new ConflictException('Esa versión de la regla ya está cerrada');
    }
    if (regla.activo) {
      throw new ConflictException('La regla ya está activa');
    }

    const otra = await this.prisma.ascensos_reglas.findFirst({
      where: {
        grado_origen_id: regla.grado_origen_id,
        vigente_hasta: null,
        activo: true,
        id: { not: regla.id },
      },
      select: { nombre: true },
    });
    if (otra) {
      throw new ConflictException(
        `Ese grado de origen ya tiene otra regla activa ("${otra.nombre}"). Desactivala primero.`,
      );
    }

    await this.prisma.ascensos_reglas.update({
      where: { id: regla.id },
      data: { activo: true, actualizado_por: usuarioId ?? null, actualizado_en: new Date() },
    });

    return this.obtener(id);
  }

  /**
   * Por cada tramo con una versión `es_por_defecto`, cierra la vigente y la
   * clona. Los tramos cargados a mano que nunca tuvieron una no se tocan: se
   * informan aparte en `conservadas`.
   */
  async restaurarDefecto(usuarioId?: bigint | null) {
    const porDefecto = await this.prisma.ascensos_reglas.findMany({
      where: { es_por_defecto: true },
      orderBy: [{ vigente_desde: 'asc' }, { id: 'asc' }],
      include: includeRegla,
    });

    // Por tramo, la versión por defecto más reciente.
    const defectoPorOrigen = new Map<string, ReglaConTodo>();
    for (const r of porDefecto) defectoPorOrigen.set(r.grado_origen_id.toString(), r);

    const vigentes = await this.prisma.ascensos_reglas.findMany({
      where: { vigente_hasta: null },
      select: { id: true, nombre: true, grado_origen_id: true, es_por_defecto: true },
    });
    const vigentePorOrigen = new Map(vigentes.map((v) => [v.grado_origen_id.toString(), v]));

    const restauradas: string[] = [];
    const sinCambios: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const fecha = hoy();

      for (const [origenId, defecto] of defectoPorOrigen) {
        const vigente = vigentePorOrigen.get(origenId);

        if (vigente && vigente.id === defecto.id) {
          sinCambios.push(defecto.nombre);
          continue;
        }

        if (vigente) {
          await tx.ascensos_reglas.update({
            where: { id: vigente.id },
            data: {
              vigente_hasta: fecha,
              actualizado_por: usuarioId ?? null,
              actualizado_en: new Date(),
            },
          });
        }

        const clon = await tx.ascensos_reglas.create({
          data: {
            nombre: defecto.nombre,
            grado_origen_id: defecto.grado_origen_id,
            grado_destino_id: defecto.grado_destino_id,
            dias_minimos: defecto.dias_minimos,
            edad_maxima: defecto.edad_maxima,
            notas: defecto.notas,
            activo: defecto.activo,
            es_por_defecto: true,
            vigente_desde: fecha,
            actualizado_por: usuarioId ?? null,
          },
        });

        await this.crearRequisitos(
          tx,
          clon.id,
          defecto.requisitos.map((r) => this.requisitoADto(r)),
        );
        restauradas.push(defecto.nombre);
      }
    });

    const conservadas = vigentes
      .filter((v) => !defectoPorOrigen.has(v.grado_origen_id.toString()))
      .map((v) => v.nombre);

    return {
      restauradas,
      sin_cambios: sinCambios,
      conservadas,
      mensaje:
        restauradas.length > 0
          ? `Se restauraron ${restauradas.length} reglas de la FAU`
          : 'Las reglas ya eran las de la FAU: no hubo cambios',
    };
  }

  // ─── Auxiliares ───────────────────────────────────────────────────────────

  private async assertGrados(origenId: number, destinoId: number) {
    const [origen, destino] = await Promise.all([
      this.prisma.grados.findUnique({
        where: { id: BigInt(origenId) },
        select: { id: true, denominacion: true, orden: true },
      }),
      this.prisma.grados.findUnique({
        where: { id: BigInt(destinoId) },
        select: { id: true, denominacion: true, orden: true },
      }),
    ]);
    if (!origen) throw new NotFoundException(`No existe el grado de origen ${origenId}`);
    if (!destino) throw new NotFoundException(`No existe el grado de destino ${destinoId}`);
    if (destino.orden <= origen.orden) {
      throw new BadRequestException(
        `${destino.denominacion} no es superior a ${origen.denominacion}: una regla de ascenso va siempre hacia arriba`,
      );
    }
  }

  private async crearRequisitos(
    tx: Prisma.TransactionClient,
    reglaId: bigint,
    requisitos: ReglaRequisitoDto[],
  ) {
    for (const [i, req] of requisitos.entries()) {
      if (req.tipo === 'CURSO_APROBADO' && (req.cursos_ids ?? []).length === 0) {
        throw new BadRequestException(
          `El requisito "${req.descripcion}" es de curso aprobado y no tiene ningún curso vinculado`,
        );
      }

      const creado = await tx.ascensos_reglas_requisitos.create({
        data: {
          regla_id: reglaId,
          tipo: req.tipo,
          descripcion: req.descripcion,
          modo: req.modo ?? 'TODOS',
          aplica_si: req.aplica_si ?? ['SIEMPRE'],
          parametros: (req.parametros as Prisma.InputJsonValue) ?? Prisma.DbNull,
          orden: req.orden ?? i + 1,
        },
      });

      const cursosIds = [...new Set(req.cursos_ids ?? [])];
      if (cursosIds.length > 0) {
        const existentes = await tx.cursos.findMany({
          where: { id: { in: cursosIds.map((c) => BigInt(c)) } },
          select: { id: true },
        });
        if (existentes.length !== cursosIds.length) {
          throw new BadRequestException(
            `Alguno de los cursos del requisito "${req.descripcion}" no existe en el catálogo`,
          );
        }
        await tx.ascensos_reglas_requisito_cursos.createMany({
          data: existentes.map((c) => ({ requisito_id: creado.id, curso_id: c.id })),
        });
      }
    }
  }

  private requisitoADto(
    req: ReglaConTodo['requisitos'][number],
  ): ReglaRequisitoDto {
    return {
      tipo: req.tipo,
      descripcion: req.descripcion,
      modo: req.modo,
      aplica_si: req.aplica_si,
      parametros: (req.parametros as Record<string, unknown>) ?? undefined,
      orden: req.orden,
      cursos_ids: req.cursos.map((c) => Number(c.curso_id)),
    };
  }

  private async versionesPorOrigen(origenIds: bigint[]) {
    if (origenIds.length === 0) return new Map<string, ReglaConTodo[]>();

    const cerradas = await this.prisma.ascensos_reglas.findMany({
      where: { grado_origen_id: { in: origenIds }, vigente_hasta: { not: null } },
      orderBy: [{ vigente_hasta: 'desc' }, { id: 'desc' }],
      include: includeRegla,
    });

    const mapa = new Map<string, ReglaConTodo[]>();
    for (const r of cerradas) {
      const clave = r.grado_origen_id.toString();
      mapa.set(clave, [...(mapa.get(clave) ?? []), r]);
    }
    return mapa;
  }

  private mapRegla(regla: ReglaConTodo, versiones?: ReglaConTodo[]) {
    return {
      id: regla.id,
      nombre: regla.nombre,
      grado_origen: regla.grado_origen,
      grado_destino: regla.grado_destino,
      dias_minimos: regla.dias_minimos,
      anios: Math.floor(regla.dias_minimos / 365),
      meses: Math.round((regla.dias_minimos % 365) / 30),
      edad_maxima: regla.edad_maxima,
      notas: regla.notas,
      es_por_defecto: regla.es_por_defecto,
      activo: regla.activo,
      vigente_desde: soloFecha(regla.vigente_desde),
      vigente_hasta: soloFecha(regla.vigente_hasta),
      actualizado_en: regla.actualizado_en,
      actualizado_por: regla.usuario
        ? { id: regla.usuario.id, username: regla.usuario.username }
        : null,
      requisitos: regla.requisitos.map((req) => ({
        id: req.id,
        tipo: req.tipo,
        descripcion: req.descripcion,
        modo: req.modo,
        aplica_si: req.aplica_si,
        parametros: req.parametros,
        orden: req.orden,
        cursos: req.cursos.map((c) => ({
          id: c.curso.id,
          nombre_curso: c.curso.nombre_curso,
          institucion: c.curso.institucion,
        })),
      })),
      ...(versiones ? { versiones_anteriores: versiones.map((v) => this.mapVersion(v)) } : {}),
    };
  }

  private mapVersion(regla: ReglaConTodo) {
    return {
      id: regla.id,
      nombre: regla.nombre,
      dias_minimos: regla.dias_minimos,
      edad_maxima: regla.edad_maxima,
      notas: regla.notas,
      activo: regla.activo,
      es_por_defecto: regla.es_por_defecto,
      vigente_desde: soloFecha(regla.vigente_desde),
      vigente_hasta: soloFecha(regla.vigente_hasta),
      actualizado_por: regla.usuario
        ? { id: regla.usuario.id, username: regla.usuario.username }
        : null,
      requisitos: regla.requisitos.map((req) => ({
        descripcion: req.descripcion,
        aplica_si: req.aplica_si,
        cursos: req.cursos.map((c) => c.curso.nombre_curso),
      })),
    };
  }
}

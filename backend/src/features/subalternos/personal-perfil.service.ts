import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import { UpdatePersonalDto } from './dto/update-personal.dto.js';

@Injectable()
export class PersonalPerfilService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── GET /personas/:id ────────────────────────────────────────────────────
  async findOne(id: number) {
    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        cedula: true,
        primer_nombre: true,
        segundo_nombre: true,
        primer_apellido: true,
        segundo_apellido: true,
        fecha_nacimiento: true,
        email: true,
        telefono: true,
        direccion: true,
        genero: true,
        estado_civil: true,
        lugar_nacimiento: true,
        etnia: true,
        codigo_postal: true,
        seccional: true,
        es_civil: true,
        relaciones_laborales: {
          where: { fecha_fin: null },
          orderBy: { fecha_inicio: 'desc' },
          take: 1,
          select: {
            id: true,
            fecha_inicio: true,
            estado: true,
            tipo_funcionario: true,
            prima_tecnica: true,
            prima_solidaria_familiar: true,
            tiene_mando: true,
            observaciones: true,
            grados: { select: { id: true, denominacion: true, codigo: true } },
            unidades: { select: { id: true, denominacion: true, codigo: true } },
            situaciones: { select: { id: true, denominacion: true, codigo: true } },
            regimenes: { select: { id: true, denominacion: true } },
            programas: { select: { id: true, denominacion: true } },
            escalafones: { select: { id: true, denominacion: true } },
            sub_unidades: { select: { id: true, denominacion: true } },
          },
        },
      },
    });

    if (!persona) throw new NotFoundException(`No existe personal con id ${id}`);

    const rel = persona.relaciones_laborales[0] ?? null;

    return {
      id: Number(persona.id),
      cedula: persona.cedula,
      primer_nombre: persona.primer_nombre,
      segundo_nombre: persona.segundo_nombre,
      primer_apellido: persona.primer_apellido,
      segundo_apellido: persona.segundo_apellido,
      nombre_completo: [persona.primer_nombre, persona.segundo_nombre, persona.primer_apellido, persona.segundo_apellido]
        .filter(Boolean).join(' '),
      fecha_nacimiento: persona.fecha_nacimiento,
      email: persona.email,
      telefono: persona.telefono,
      direccion: persona.direccion,
      genero: persona.genero,
      estado_civil: persona.estado_civil,
      lugar_nacimiento: persona.lugar_nacimiento,
      etnia: persona.etnia,
      codigo_postal: persona.codigo_postal,
      seccional: persona.seccional,
      es_civil: persona.es_civil,
      relacion_laboral: rel ? {
        id: Number(rel.id),
        fecha_inicio: rel.fecha_inicio,
        estado: rel.estado,
        tipo_funcionario: rel.tipo_funcionario,
        prima_tecnica: rel.prima_tecnica,
        prima_solidaria_familiar: rel.prima_solidaria_familiar,
        tiene_mando: rel.tiene_mando,
        observaciones: rel.observaciones,
        grado: rel.grados ? { id: Number(rel.grados.id), denominacion: rel.grados.denominacion, codigo: rel.grados.codigo } : null,
        unidad: rel.unidades ? { id: Number(rel.unidades.id), denominacion: rel.unidades.denominacion, codigo: rel.unidades.codigo } : null,
        situacion: rel.situaciones ? { id: Number(rel.situaciones.id), denominacion: rel.situaciones.denominacion, codigo: rel.situaciones.codigo } : null,
        regimen: rel.regimenes ? { id: Number(rel.regimenes.id), denominacion: rel.regimenes.denominacion } : null,
        programa: rel.programas ? { id: Number(rel.programas.id), denominacion: rel.programas.denominacion } : null,
        escalafon: rel.escalafones ? { id: Number(rel.escalafones.id), denominacion: rel.escalafones.denominacion } : null,
        sub_unidad: rel.sub_unidades ? { id: Number(rel.sub_unidades.id), denominacion: rel.sub_unidades.denominacion } : null,
      } : null,
    };
  }

  // ─── GET /personas/:id/familiares ─────────────────────────────────────────
  async findFamiliares(id: number) {
    await this.assertExiste(id);

    const relaciones = await this.prisma.relaciones_familiares.findMany({
      where: { persona_id: BigInt(id) },
      select: {
        tipo_relacion: true,
        personas_relaciones_familiares_familiar_idTopersonas: {
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
                grados: { select: { denominacion: true } },
                unidades: { select: { denominacion: true } },
              },
            },
          },
        },
      },
    });

    return relaciones.map((r) => {
      const f = r.personas_relaciones_familiares_familiar_idTopersonas;
      const rel = f.relaciones_laborales[0] ?? null;
      return {
        id: Number(f.id),
        cedula: f.cedula,
        nombre_completo: [f.primer_nombre, f.segundo_nombre, f.primer_apellido, f.segundo_apellido]
          .filter(Boolean).join(' '),
        tipo_relacion: r.tipo_relacion,
        grado: rel?.grados?.denominacion ?? null,
        unidad: rel?.unidades?.denominacion ?? null,
      };
    });
  }

  // ─── GET /personas/:id/historial-militar ─────────────────────────────────
  async findHistorialMilitar(id: number) {
    await this.assertExiste(id);

    const [ascensos, primeraRelacion, retiro] = await Promise.all([
      this.prisma.ascensos.findMany({
        where: { persona_id: BigInt(id) },
        orderBy: { fecha_ascenso: 'desc' },
        select: {
          id: true,
          fecha_ascenso: true,
          observaciones: true,
          grados: { select: { id: true, denominacion: true, codigo: true } },
        },
      }),
      this.prisma.relaciones_laborales.findFirst({
        where: { persona_id: BigInt(id) },
        orderBy: { fecha_inicio: 'asc' },
        select: {
          fecha_inicio: true,
          grados: { select: { id: true, denominacion: true, codigo: true } },
        },
      }),
      this.prisma.retiros.findUnique({
        where: { persona_id: BigInt(id) },
        select: { fecha_retiro: true, hora_retiro: true, motivo: true },
      }),
    ]);

    // ascensos viene ordenado desc (más reciente primero), el primero es el rango actual
    const entradasAscensos = ascensos.map((a, idx) => ({
      id: Number(a.id),
      fecha_ascenso: a.fecha_ascenso,
      numero_orden: a.observaciones ?? null,
      es_rango_inicial: false,
      es_rango_actual: idx === 0,
      grado: a.grados ? {
        id: Number(a.grados.id),
        denominacion: a.grados.denominacion,
        codigo: a.grados.codigo,
      } : null,
    }));

    const entradaInicial = primeraRelacion ? {
      id: null,
      fecha_ascenso: primeraRelacion.fecha_inicio,
      numero_orden: null,
      es_rango_inicial: true,
      es_rango_actual: ascensos.length === 0,
      grado: primeraRelacion.grados ? {
        id: Number(primeraRelacion.grados.id),
        denominacion: primeraRelacion.grados.denominacion,
        codigo: primeraRelacion.grados.codigo,
      } : null,
    } : null;

    // más reciente arriba, rango inicial al final
    const historial_rangos = [
      ...entradasAscensos,
      ...(entradaInicial ? [entradaInicial] : []),
    ];

    return {
      historial_rangos,
      retiro: retiro ? {
        fecha_retiro: retiro.fecha_retiro,
        hora_retiro: retiro.hora_retiro,
        motivo: retiro.motivo,
      } : null,
    };
  }

  // ─── GET /personas/:id/cursos ─────────────────────────────────────────────
  async findCursos(id: number) {
    await this.assertExiste(id);

    const registros = await this.prisma.funcionarios_cursos.findMany({
      where: { persona_id: BigInt(id) },
      orderBy: { fecha_inicio: 'desc' },
      select: {
        numero_orden: true,
        boletin: true,
        fecha_inicio: true,
        fecha_fin: true,
        calificacion: true,
        cursos: {
          select: {
            id: true,
            nombre_curso: true,
            institucion: true,
            es_obligatorio: true,
          },
        },
      },
    });

    return registros.map((r) => ({
      curso_id: Number(r.cursos.id),
      nombre_curso: r.cursos.nombre_curso,
      institucion: r.cursos.institucion,
      es_obligatorio: r.cursos.es_obligatorio,
      // El boletín/orden ahora viven en la inscripción (no en la definición del curso).
      boletin: r.boletin,
      numero_orden: r.numero_orden,
      fecha_inicio: r.fecha_inicio,
      fecha_fin: r.fecha_fin,
      calificacion: r.calificacion,
      completado: r.fecha_fin != null,
    }));
  }

  // ─── GET /personas/:id/misiones ───────────────────────────────────────────
  async findMisiones(id: number) {
    await this.assertExiste(id);

    const registros = await this.prisma.funcionarios_convocatorias.findMany({
      where: { persona_id: BigInt(id) },
      include: {
        convocatorias: {
          include: {
            misiones: {
              select: { id: true, nombre_mision: true, pais: true },
            },
          },
        },
      },
      orderBy: { convocatorias: { fecha_salida: 'desc' } },
    });

    return registros.map((r) => ({
      mision_id: r.convocatorias.misiones.id.toString(),
      convocatoria_id: r.convocatoria_id.toString(),
      nombre_mision: r.convocatorias.misiones.nombre_mision,
      pais: r.convocatorias.misiones.pais,
      fecha_salida: r.convocatorias.fecha_salida
        ? r.convocatorias.fecha_salida.toISOString().split('T')[0]
        : null,
      fecha_llegada: r.convocatorias.fecha_llegada
        ? r.convocatorias.fecha_llegada.toISOString().split('T')[0]
        : null,
      numero_orden: r.numero_orden,
      boletin: r.boletin,
      finalizada:
        r.convocatorias.fecha_llegada !== null &&
        r.convocatorias.fecha_llegada <= new Date(),
    }));
  }

  // ─── PATCH /personas/:id ──────────────────────────────────────────────────
  async update(id: number, dto: UpdatePersonalDto) {
    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, relaciones_laborales: { where: { fecha_fin: null }, take: 1, select: { id: true } } },
    });
    if (!persona) throw new NotFoundException(`No existe personal con id ${id}`);

    await Promise.all([
      this.prisma.personas.update({
        where: { id: BigInt(id) },
        data: {
          primer_nombre: dto.primer_nombre,
          segundo_nombre: dto.segundo_nombre,
          primer_apellido: dto.primer_apellido,
          segundo_apellido: dto.segundo_apellido,
          fecha_nacimiento: dto.fecha_nacimiento ? new Date(dto.fecha_nacimiento) : undefined,
          email: dto.email,
          telefono: dto.telefono,
          direccion: dto.direccion,
          genero: dto.genero,
          estado_civil: dto.estado_civil,
          lugar_nacimiento: dto.lugar_nacimiento,
          etnia: dto.etnia,
          codigo_postal: dto.codigo_postal,
          seccional: dto.seccional,
        },
      }),
      persona.relaciones_laborales[0] && (
        dto.grado_id || dto.unidad_id || dto.situacion_id || dto.regimen_id ||
        dto.programa_id || dto.escalafon_id || dto.sub_unidad_id !== undefined ||
        dto.prima_tecnica !== undefined || dto.tiene_mando !== undefined || dto.observaciones_laborales !== undefined
      )
        ? this.prisma.relaciones_laborales.update({
            where: { id: persona.relaciones_laborales[0].id },
            data: {
              ...(dto.grado_id && { grado_id: BigInt(dto.grado_id) }),
              ...(dto.unidad_id && { unidad_id: BigInt(dto.unidad_id) }),
              ...(dto.situacion_id && { situacion_id: BigInt(dto.situacion_id) }),
              ...(dto.regimen_id && { regimen_id: BigInt(dto.regimen_id) }),
              ...(dto.programa_id && { programa_id: BigInt(dto.programa_id) }),
              ...(dto.escalafon_id && { escalafon_id: BigInt(dto.escalafon_id) }),
              ...(dto.sub_unidad_id !== undefined && { sub_unidad_id: dto.sub_unidad_id ? BigInt(dto.sub_unidad_id) : null }),
              ...(dto.prima_tecnica !== undefined && { prima_tecnica: dto.prima_tecnica }),
              ...(dto.tiene_mando !== undefined && { tiene_mando: dto.tiene_mando }),
              ...(dto.observaciones_laborales !== undefined && { observaciones: dto.observaciones_laborales }),
            },
          })
        : Promise.resolve(null),
    ]);

    return this.findOne(id);
  }

  private async assertExiste(id: number) {
    const existe = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException(`No existe personal con id ${id}`);
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import {
  AlcanceResuelto,
  unidadIdDeAlcance,
} from '../../lib/alcance/alcance.types.js';
import { assertPersonaEnAlcance } from '../../lib/alcance/alcance.where.js';
import { UpdatePersonalDto } from './dto/update-personal.dto.js';
import { FamiliarDto } from './dto/familiar.dto.js';
import { assertFechaInicioPosteriorANacimiento } from './validaciones-fechas.js';
import {
  guardarLegajoEnTransaccion,
} from './legajo-militar.service.js';
import {
  ETIQUETAS_NIVEL_EDUCATIVO,
  NivelEducativo,
  esMutado,
} from './legajo-militar.constants.js';
import { CierreCarreraService } from '../retiros/cierre-carrera.service.js';

@Injectable()
export class PersonalPerfilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cierre: CierreCarreraService,
  ) {}

  // ─── GET /personas/:id ────────────────────────────────────────────────────
  async findOne(id: number, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);

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
        legajo_militar: {
          select: {
            nivel_educativo: true,
            fecha_ingreso_eta: true,
            fecha_egreso_eta: true,
            numero_orden_egreso_eta: true,
          },
        },
        relaciones_laborales: {
          where: { fecha_fin: null },
          orderBy: { fecha_inicio: 'desc' },
          take: 1,
          select: {
            id: true,
            fecha_inicio: true,
            fecha_ultimo_ascenso: true,
            fecha_ascenso_oficial: true,
            mutaciones: true,
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
    const legajo = persona.legajo_militar;
    const nivelEducativo = legajo?.nivel_educativo ?? null;

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
      legajo_militar: {
        nivel_educativo: nivelEducativo,
        nivel_educativo_label: nivelEducativo
          ? (ETIQUETAS_NIVEL_EDUCATIVO[nivelEducativo as NivelEducativo] ?? nivelEducativo)
          : null,
        fecha_ingreso_eta: legajo?.fecha_ingreso_eta ?? null,
        fecha_egreso_eta: legajo?.fecha_egreso_eta ?? null,
        numero_orden_egreso_eta: legajo?.numero_orden_egreso_eta ?? null,
        egresado_eta: (legajo?.fecha_egreso_eta ?? null) !== null,
        mutaciones: rel?.mutaciones ?? null,
        es_mutado: esMutado(rel?.mutaciones ?? null),
      },
      relacion_laboral: rel ? {
        id: Number(rel.id),
        fecha_inicio: rel.fecha_inicio,
        fecha_ultimo_ascenso: rel.fecha_ultimo_ascenso,
        fecha_ascenso_oficial: rel.fecha_ascenso_oficial,
        mutaciones: rel.mutaciones,
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

  // ─── GET /personas/cedula/:cedula/familiares ──────────────────────────────
  async findFamiliaresPorCedula(cedula: string, alcance?: AlcanceResuelto) {
    const persona = await this.prisma.personas.findUnique({
      where: { cedula },
      select: { id: true },
    });
    if (!persona) throw new NotFoundException(`No existe personal con cédula ${cedula}`);

    return this.findFamiliares(Number(persona.id), alcance);
  }

  // ─── GET /personas/:id/familiares ─────────────────────────────────────────
  async findFamiliares(id: number, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);

    await this.assertExiste(id);

    const personaSelect = {
      id: true,
      cedula: true,
      primer_nombre: true,
      segundo_nombre: true,
      primer_apellido: true,
      segundo_apellido: true,
      genero: true,
      relaciones_laborales: {
        where: { fecha_fin: null },
        take: 1,
        select: {
          grados: { select: { denominacion: true } },
          unidades: { select: { denominacion: true } },
        },
      },
    };

    const relaciones = await this.prisma.relaciones_familiares.findMany({
      where: { OR: [{ persona_id: BigInt(id) }, { familiar_id: BigInt(id) }] },
      select: {
        persona_id: true,
        tipo_relacion: true,
        personas_relaciones_familiares_persona_idTopersonas: { select: personaSelect },
        personas_relaciones_familiares_familiar_idTopersonas: { select: personaSelect },
      },
    });

    return relaciones.map((r) => {
      const esAnclaLaPersona = Number(r.persona_id) === id;
      const f = esAnclaLaPersona
        ? r.personas_relaciones_familiares_familiar_idTopersonas
        : r.personas_relaciones_familiares_persona_idTopersonas;
      const anclaGenero = esAnclaLaPersona
        ? null
        : r.personas_relaciones_familiares_familiar_idTopersonas.genero;
      const tipoRelacion = esAnclaLaPersona
        ? r.tipo_relacion
        : this.invertirTipoRelacion(r.tipo_relacion, anclaGenero);
      const rel = f.relaciones_laborales[0] ?? null;
      return {
        id: Number(f.id),
        cedula: f.cedula,
        nombre_completo: [f.primer_nombre, f.segundo_nombre, f.primer_apellido, f.segundo_apellido]
          .filter(Boolean).join(' '),
        tipo_relacion: tipoRelacion,
        grado: rel?.grados?.denominacion ?? null,
        unidad: rel?.unidades?.denominacion ?? null,
      };
    });
  }

  /**
   * `tipo_relacion` se carga desde la perspectiva de quien da de alta el vínculo (persona_id),
   * describiendo qué es el familiar respecto de esa persona. Al listar los familiares de la otra
   * punta de la relación (familiar_id) hay que invertir esa descripción.
   */
  private invertirTipoRelacion(tipo: string | null, generoAncla: string | null): string | null {
    if (!tipo) return tipo;
    switch (tipo.trim()) {
      case 'Madre':
      case 'Padre':
        return 'Hijo/a';
      case 'Hijo/a':
        if (generoAncla?.startsWith('F')) return 'Madre';
        if (generoAncla?.startsWith('M')) return 'Padre';
        return 'Padre/Madre';
      case 'Cónyuge':
        return 'Cónyuge';
      case 'Hermano/a':
        return 'Hermano/a';
      default:
        return tipo;
    }
  }

  // ─── POST /personas/:id/familiares ────────────────────────────────────────
  async addFamiliar(id: number, dto: FamiliarDto, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);
    await this.assertExiste(id);

    const familiar = await this.prisma.personas.findUnique({
      where: { cedula: dto.cedula },
      select: { id: true, cedula: true, primer_nombre: true, primer_apellido: true, es_civil: true },
    });
    if (!familiar) throw new BadRequestException(`No existe ningún personal registrado con cédula ${dto.cedula}`);
    if (familiar.es_civil) throw new BadRequestException(`El familiar con cédula ${dto.cedula} es civil. Debe ser un oficial o subalterno`);
    if (Number(familiar.id) === id) throw new BadRequestException('Una persona no puede ser familiar de sí misma');

    const yaVinculados = await this.prisma.relaciones_familiares.findFirst({
      where: {
        OR: [
          { persona_id: BigInt(id), familiar_id: familiar.id },
          { persona_id: familiar.id, familiar_id: BigInt(id) },
        ],
      },
    });
    if (yaVinculados) throw new ConflictException(`${familiar.primer_nombre} ${familiar.primer_apellido} ya está vinculado como familiar`);

    await this.prisma.relaciones_familiares.create({
      data: { persona_id: BigInt(id), familiar_id: familiar.id, tipo_relacion: dto.tipo_relacion ?? null },
    });

    return {
      id: Number(familiar.id),
      cedula: familiar.cedula,
      nombre_completo: `${familiar.primer_nombre} ${familiar.primer_apellido}`,
      tipo_relacion: dto.tipo_relacion ?? null,
      grado: null,
      unidad: null,
    };
  }

  // ─── DELETE /personas/:id/familiares/:familiarId ──────────────────────────
  async removeFamiliar(id: number, familiarId: number, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);
    await this.assertExiste(id);

    const { count } = await this.prisma.relaciones_familiares.deleteMany({
      where: {
        OR: [
          { persona_id: BigInt(id), familiar_id: BigInt(familiarId) },
          { persona_id: BigInt(familiarId), familiar_id: BigInt(id) },
        ],
      },
    });
    if (count === 0) throw new NotFoundException('No existe ese vínculo familiar');
  }

  // ─── GET /personas/:id/historial-militar ─────────────────────────────────
  async findHistorialMilitar(id: number, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);

    await this.assertExiste(id);

    const [ascensos, primeraRelacion, retiros, relacionActivaHoy] = await Promise.all([
      this.prisma.ascensos.findMany({
        where: { persona_id: BigInt(id) },
        orderBy: { fecha_ascenso: 'desc' },
        select: {
          id: true,
          fecha_ascenso: true,
          observaciones: true,
          numero_orden: true,
          cumplia_requisitos: true,
          motivo_excepcion: true,
          anulado_en: true,
          motivo_anulacion: true,
          orden_ascenso_id: true,
          grados: { select: { id: true, denominacion: true, codigo: true } },
          grados_grado_anterior: { select: { id: true, denominacion: true, codigo: true } },
        },
      }),
      this.prisma.relaciones_laborales.findFirst({
        where: { persona_id: BigInt(id) },
        // Un ascenso copia `fecha_inicio` a la relación nueva, así que el
        // desempate por id es lo que devuelve la relación de ingreso.
        orderBy: [{ fecha_inicio: 'asc' }, { id: 'asc' }],
        select: {
          fecha_inicio: true,
          grados: { select: { id: true, denominacion: true, codigo: true } },
        },
      }),
      // Un funcionario puede tener más de un retiro: se retira, lo reincorporan
      // y se vuelve a retirar. Los anulados (errores de carga) no cuentan.
      this.prisma.retiros.findMany({
        where: { persona_id: BigInt(id), anulado: false },
        orderBy: { fecha_retiro: 'desc' },
        select: {
          id: true,
          fecha_retiro: true,
          hora_retiro: true,
          motivo: true,
          motivos_baja: { select: { codigo: true, denominacion: true } },
        },
      }),
      this.prisma.relaciones_laborales.findFirst({
        where: { persona_id: BigInt(id), estado: 'activo' },
        select: { id: true },
      }),
    ]);

    // El rango actual es el ascenso más nuevo que no esté anulado.
    const idRangoActual = ascensos.find((a) => a.anulado_en == null)?.id ?? null;

    const entradasAscensos = ascensos.map((a) => ({
      id: Number(a.id),
      fecha_ascenso: a.fecha_ascenso,
      // Las filas viejas tenían el número de orden en observaciones.
      numero_orden: a.numero_orden ?? a.observaciones ?? null,
      observaciones: a.observaciones,
      orden_ascenso_id: a.orden_ascenso_id ? Number(a.orden_ascenso_id) : null,
      es_rango_inicial: false,
      es_rango_actual: idRangoActual != null && a.id === idRangoActual,
      cumplia_requisitos: a.cumplia_requisitos,
      por_excepcion: a.cumplia_requisitos === false,
      motivo_excepcion: a.motivo_excepcion,
      anulado: a.anulado_en != null,
      motivo_anulacion: a.motivo_anulacion,
      grado: a.grados ? {
        id: Number(a.grados.id),
        denominacion: a.grados.denominacion,
        codigo: a.grados.codigo,
      } : null,
      grado_anterior: a.grados_grado_anterior ? {
        id: Number(a.grados_grado_anterior.id),
        denominacion: a.grados_grado_anterior.denominacion,
        codigo: a.grados_grado_anterior.codigo,
      } : null,
    }));

    // La relación de ingreso guarda el grado ACTUAL, no con el que entró. Si hay
    // ascensos cargados, el grado de ingreso es el anterior al más viejo de ellos.
    const masViejo = entradasAscensos[entradasAscensos.length - 1];
    const gradoDeIngreso = masViejo?.grado_anterior ?? (primeraRelacion?.grados ? {
      id: Number(primeraRelacion.grados.id),
      denominacion: primeraRelacion.grados.denominacion,
      codigo: primeraRelacion.grados.codigo,
    } : null);

    const entradaInicial = primeraRelacion ? {
      id: null,
      fecha_ascenso: primeraRelacion.fecha_inicio,
      numero_orden: null,
      observaciones: null,
      orden_ascenso_id: null,
      es_rango_inicial: true,
      es_rango_actual: idRangoActual == null,
      cumplia_requisitos: null,
      por_excepcion: false,
      motivo_excepcion: null,
      anulado: false,
      motivo_anulacion: null,
      grado: gradoDeIngreso,
      grado_anterior: null,
    } : null;

    // más reciente arriba, rango inicial al final
    const historial_rangos = [
      ...entradasAscensos,
      ...(entradaInicial ? [entradaInicial] : []),
    ];

    return {
      historial_rangos,
      retiros: retiros.map((r, idx) => ({
        id: r.id.toString(),
        fecha_retiro: r.fecha_retiro ? r.fecha_retiro.toISOString().split('T')[0] : null,
        hora_retiro: r.hora_retiro ? r.hora_retiro.toISOString().split('T')[1].slice(0, 8) : null,
        motivo: r.motivo,
        motivo_baja: r.motivos_baja
          ? { codigo: r.motivos_baja.codigo, denominacion: r.motivos_baja.denominacion }
          : null,
        // Solo el retiro más reciente puede estar en pie, y solo si la persona
        // no volvió al servicio.
        vigente: idx === 0 && relacionActivaHoy === null,
      })),
    };
  }

  // ─── GET /personas/:id/cursos ─────────────────────────────────────────────
  async findCursos(id: number, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);

    await this.assertExiste(id);

    const registros = await this.prisma.funcionarios_cursos.findMany({
      where: { persona_id: BigInt(id) },
      orderBy: { fecha_inicio: 'desc' },
      select: {
        numero_orden: true,
        boletin: true,
        fecha_inicio: true,
        fecha_fin: true,
        aprobado: true,
        calificacion: true,
        observacion_calificacion: true,
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
      aprobado: r.aprobado,
      calificacion: r.calificacion,
      observacion: r.observacion_calificacion,
      completado: r.fecha_fin != null,
    }));
  }

  // ─── GET /personas/:id/misiones ───────────────────────────────────────────
  async findMisiones(id: number, alcance?: AlcanceResuelto) {
    await this.assertAlcance(id, alcance);

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

  // ─── GET /personas/:id/destinos ───────────────────────────────────────────
  async findDestinos(id: number) {
    await this.assertExiste(id);

    const asignaciones = await this.prisma.destinos.findMany({
      where: { persona_id: BigInt(id) },
      include: {
        unidades: { select: { id: true, codigo: true, denominacion: true, tipo: true } },
      },
      orderBy: { fecha_inicio: 'desc' },
    });

    return asignaciones.map((a) => ({
      id: a.id.toString(),
      unidad_id: a.unidad_id ? a.unidad_id.toString() : null,
      unidad: a.unidades?.denominacion ?? null,
      codigo_unidad: a.unidades?.codigo ?? null,
      tipo_unidad: a.unidades?.tipo ?? null,
      posicion_destino: a.posicion_destino,
      fecha_inicio: a.fecha_inicio ? a.fecha_inicio.toISOString().split('T')[0] : null,
      fecha_fin: a.fecha_fin ? a.fecha_fin.toISOString().split('T')[0] : null,
      numero_orden: a.numero_orden,
      boletin: a.boletin,
      observaciones: a.observaciones,
      activo: a.fecha_fin == null,
    }));
  }

  // ─── PATCH /personas/:id ──────────────────────────────────────────────────
  async update(
    id: number,
    dto: UpdatePersonalDto,
    autorId: bigint,
    alcance?: AlcanceResuelto,
  ) {
    await this.assertAlcance(id, alcance);

    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        fecha_nacimiento: true,
        relaciones_laborales: { where: { fecha_fin: null }, take: 1, select: { id: true, fecha_inicio: true } },
      },
    });
    if (!persona) throw new NotFoundException(`No existe personal con id ${id}`);

    const relacionActiva = persona.relaciones_laborales[0];

    // Con alcance de unidad no se puede mover personal fuera de la propia unidad: seria una via
    // para sacarse gente de encima o para apropiarse de personal ajeno.
    if (alcance && dto.unidad_id) {
      const unidadPropia = unidadIdDeAlcance(alcance);
      if (unidadPropia !== null && dto.unidad_id.toString() !== unidadPropia.toString()) {
        throw new BadRequestException(
          'No podes cambiar el destino de un funcionario a otra unidad',
        );
      }
    }

    if (dto.fecha_nacimiento || dto.fecha_inicio) {
      assertFechaInicioPosteriorANacimiento(
        dto.fecha_inicio ?? relacionActiva?.fecha_inicio,
        dto.fecha_nacimiento ?? persona.fecha_nacimiento,
      );
    }

    if (dto.fecha_nacimiento) {
      const primeraRelacion = await this.prisma.relaciones_laborales.findFirst({
        where: { persona_id: BigInt(id) },
        orderBy: { fecha_inicio: 'asc' },
        select: { fecha_inicio: true },
      });
      assertFechaInicioPosteriorANacimiento(
        primeraRelacion?.fecha_inicio,
        dto.fecha_nacimiento,
      );
    }

    // Datos personales, relación laboral y legajo se guardan juntos o no se guarda nada.
    await this.prisma.$transaction(async (tx) => {
      await tx.personas.update({
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
          ...(dto.fecha_fallecimiento !== undefined && {
            fecha_fallecimiento: new Date(dto.fecha_fallecimiento),
          }),
        },
      });

      const tocaRelacion =
        dto.fecha_inicio || dto.grado_id || dto.unidad_id || dto.situacion_id || dto.regimen_id ||
        dto.programa_id || dto.escalafon_id || dto.sub_unidad_id !== undefined ||
        dto.prima_tecnica !== undefined || dto.tiene_mando !== undefined ||
        dto.observaciones_laborales !== undefined || dto.mutaciones !== undefined;

      if (relacionActiva && tocaRelacion) {
        await tx.relaciones_laborales.update({
          where: { id: relacionActiva.id },
          data: {
            ...(dto.fecha_inicio && { fecha_inicio: new Date(dto.fecha_inicio) }),
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
            ...(dto.mutaciones !== undefined && { mutaciones: dto.mutaciones ?? null }),
          },
        });
      }

      await guardarLegajoEnTransaccion(tx, BigInt(id), dto);
    });

    // El fallecimiento es un hecho sobre la persona, pero cierra la carrera. La
    // cascada vive una sola vez, en CierreCarreraService: acá es la segunda
    // puerta, y va forzada porque un fallecido no elige qué cerrar.
    if (dto.fecha_fallecimiento) {
      const activa = await this.prisma.relaciones_laborales.findFirst({
        where: { persona_id: BigInt(id), estado: 'activo' },
        select: { id: true },
      });

      if (activa) {
        const motivo = await this.prisma.motivos_baja.findFirst({
          where: { codigo: 'FALLECIMIENTO' },
          select: { id: true },
        });
        if (motivo) {
          await this.cierre.cerrar({
            personaId: id,
            fechaRetiro: new Date(dto.fecha_fallecimiento),
            motivoBajaId: Number(motivo.id),
            motivo: 'Fallecimiento',
            autorId,
            cierres: { destino: true, inscripciones: [], usuario: true },
            forzarCascada: true,
          });
        }
      }
    }

    // No hace falta invalidar ninguna sesion: la unidad del usuario del sistema es
    // independiente del destino del funcionario, y el filtrado de datos se resuelve por
    // consulta en cada request.
    return this.findOne(id);
  }

  /**
   * 404 y no 403 a proposito: devolver 403 confirmaria que la persona existe y permitiria
   * enumerar el padron por IDs. Ver spec 002 seccion 7.
   */
  private async assertAlcance(id: number, alcance?: AlcanceResuelto) {
    if (!alcance) return;
    await assertPersonaEnAlcance(this.prisma, BigInt(id), alcance);
  }

  private async assertExiste(id: number) {
    const existe = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException(`No existe personal con id ${id}`);
  }
}

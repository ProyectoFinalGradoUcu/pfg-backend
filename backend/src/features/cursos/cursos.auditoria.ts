import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, fotoDeDocumento, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import { nombrePersona, SELECT_NOMBRE_PERSONA } from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';

const ARCHIVO = { select: { nombre_original: true } } as const;

// La nota se guarda como texto, si es número se muestra como número
const nota = (v: string | null) => (v !== null && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

export async function fotoCurso(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const c = await prisma.cursos.findUnique({
    where: { id },
    select: {
      nombre_curso: true,
      institucion: true,
      es_obligatorio: true,
      sub_unidades: { select: { denominacion: true } },
      unidades: { select: { denominacion: true } },
      modulos_curso: { select: { nombre_modulo: true }, orderBy: [{ orden_modulo: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!c) return null;
  return {
    nombre: c.nombre_curso ?? '',
    campos: {
      nombre_curso: c.nombre_curso,
      institucion: c.institucion,
      es_obligatorio: c.es_obligatorio,
      sub_unidad: c.sub_unidades?.denominacion ?? null,
      comando: c.unidades?.denominacion ?? null,
      modulos: c.modulos_curso.map((m) => m.nombre_modulo),
    },
  };
}

export async function fotoModuloCurso(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const m = await prisma.modulos_curso.findUnique({
    where: { id },
    select: {
      nombre_modulo: true,
      orden_modulo: true,
      descripcion: true,
      cursos: { select: { nombre_curso: true } },
      _count: { select: { funcionarios_modulos_curso: true } },
    },
  });
  if (!m) return null;
  return {
    nombre: m.nombre_modulo,
    campos: {
      curso: m.cursos?.nombre_curso ?? null,
      nombre_modulo: m.nombre_modulo,
      orden_modulo: m.orden_modulo,
      descripcion: m.descripcion,
      // Al borrar el módulo se pierden sus completaciones.
      completaciones: m._count.funcionarios_modulos_curso,
    },
  };
}

async function cargarDesignacion(id: bigint, prisma: PrismaService) {
  const d = await prisma.funcionarios_cursos.findUnique({
    where: { id },
    select: {
      numero_orden: true,
      boletin: true,
      fecha_inicio: true,
      fecha_fin: true,
      aprobado: true,
      calificacion: true,
      observacion_calificacion: true,
      dado_de_baja: true,
      motivo_baja: true,
      fecha_baja: true,
      usuarios: { select: { username: true } },
      personas: { select: SELECT_NOMBRE_PERSONA },
      cursos: { select: { nombre_curso: true } },
      archivo_orden: ARCHIVO,
      archivo_boletin: ARCHIVO,
    },
  });
  if (!d) return null;
  const persona = nombrePersona(d.personas);
  const curso = d.cursos?.nombre_curso ?? null;
  return { fila: d, persona, curso, nombre: [persona, curso].filter(Boolean).join(' en ') };
}

// Inscripción de una persona a un curso
export async function fotoDesignacion(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const d = await cargarDesignacion(id, prisma);
  if (!d) return null;
  const f = d.fila;
  return {
    nombre: d.nombre,
    campos: {
      persona: d.persona,
      curso: d.curso,
      numero_orden: f.numero_orden,
      boletin: f.boletin,
      fecha_inicio: f.fecha_inicio,
      fecha_fin: f.fecha_fin,
      aprobado: f.aprobado,
      calificacion: nota(f.calificacion),
      observacion: f.observacion_calificacion,
      dado_de_baja: f.dado_de_baja,
      motivo_baja: f.motivo_baja,
      fecha_baja: f.fecha_baja,
      dado_de_baja_por: f.usuarios?.username ?? null,
    },
  };
}

// Resultados del curso, una clave por persona
export async function fotoResultadosCurso(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const c = await prisma.cursos.findUnique({
    where: { id },
    select: {
      nombre_curso: true,
      funcionarios_cursos: {
        where: { dado_de_baja: false },
        orderBy: { id: 'asc' },
        select: {
          aprobado: true,
          calificacion: true,
          observacion_calificacion: true,
          personas: { select: SELECT_NOMBRE_PERSONA },
        },
      },
    },
  });
  if (!c) return null;
  const campos: Record<string, unknown> = {};
  for (const d of c.funcionarios_cursos) {
    const persona = nombrePersona(d.personas);
    if (!persona) continue;
    campos[persona] = {
      calificacion: nota(d.calificacion),
      aprobado: d.aprobado === null ? null : d.aprobado ? 'Aprobado' : 'Reprobado',
      observacion: d.observacion_calificacion,
    };
  }
  return { nombre: c.nombre_curso ?? '', campos };
}

export async function fotoDocumentoDesignacion(
  id: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
): Promise<FotoAuditoria | null> {
  const d = await cargarDesignacion(id, prisma);
  if (!d) return null;
  return fotoDeDocumento(d.fila, params.slot, d.nombre, { persona: d.persona, curso: d.curso });
}

@Injectable()
export class CursosAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('curso', fotoCurso);
    this.fotos.registrar('modulo_curso', fotoModuloCurso);
    this.fotos.registrar('designacion', fotoDesignacion);
    this.fotos.registrar('resultados_curso', fotoResultadosCurso);
    this.fotos.registrar('documento_designacion', fotoDocumentoDesignacion);
  }
}

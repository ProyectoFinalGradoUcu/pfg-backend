import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, fotoDeDocumento, type FotoAuditoria } from '../auditoria/auditoria-fotos.js';
import type { PrismaService } from '../../lib/prisma.service.js';
import { SLOTS_DOCUMENTO, type SlotDocumento } from '../archivos/documentos-de-registro.js';

const den = { select: { denominacion: true } } as const;
const fecha = (f: Date | null | undefined) => (f ? f.toISOString().slice(0, 10) : null);

// Igual que en los nombres de la bitácora: "Cabo Juan Pérez a Sargento".
const nombreAscenso = (a: {
  personas: { primer_nombre: string; primer_apellido: string } | null;
  grados_grado_anterior: { denominacion: string } | null;
  grados: { denominacion: string } | null;
}) => {
  const quien = [a.grados_grado_anterior?.denominacion, a.personas?.primer_nombre, a.personas?.primer_apellido]
    .filter(Boolean)
    .join(' ');
  return a.grados ? `${quien} a ${a.grados.denominacion}` : quien;
};

// Una línea por ascenso de la orden: "Juan Pérez: Sgto. → Sgto. 1°".
const lineaAscenso = (a: Parameters<typeof nombreAscenso>[0]) => {
  const quien = [a.personas?.primer_nombre, a.personas?.primer_apellido].filter(Boolean).join(' ');
  const grados = [a.grados_grado_anterior?.denominacion, a.grados?.denominacion].filter(Boolean).join(' → ');
  return grados ? `${quien}: ${grados}` : quien;
};

const SELECT_ASCENSO = {
  personas: { select: { primer_nombre: true, primer_apellido: true } },
  grados_grado_anterior: den,
  grados: den,
} as const;

export async function fotoOrdenAscenso(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const o = await prisma.ascensos_ordenes.findUnique({
    where: { id },
    select: {
      numero_orden: true,
      fecha_orden: true,
      boletin: true,
      observaciones: true,
      ascensos: { where: { anulado_en: null }, orderBy: { id: 'asc' }, select: SELECT_ASCENSO },
    },
  });
  if (!o) return null;
  return {
    nombre: o.numero_orden ?? `del ${fecha(o.fecha_orden)}`,
    campos: {
      numero_orden: o.numero_orden,
      fecha_orden: fecha(o.fecha_orden),
      boletin: o.boletin,
      observaciones: o.observaciones,
      ascensos: o.ascensos.map(lineaAscenso),
    },
  };
}

export async function fotoAscenso(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const a = await prisma.ascensos.findUnique({
    where: { id },
    select: {
      ...SELECT_ASCENSO,
      fecha_ascenso: true,
      numero_orden: true,
      observaciones: true,
      cumplia_requisitos: true,
      motivo_excepcion: true,
      ascensos_ordenes: { select: { numero_orden: true } },
    },
  });
  if (!a) return null;
  return {
    nombre: nombreAscenso(a),
    campos: {
      // Con el grado que tenía al ascender
      persona: a.personas
        ? [a.grados_grado_anterior?.denominacion, a.personas.primer_nombre, a.personas.primer_apellido].filter(Boolean).join(' ')
        : null,
      grado_anterior: a.grados_grado_anterior?.denominacion ?? null,
      grado: a.grados?.denominacion ?? null,
      fecha_ascenso: fecha(a.fecha_ascenso),
      orden: a.ascensos_ordenes?.numero_orden ?? a.numero_orden,
      cumplia_requisitos: a.cumplia_requisitos,
      motivo_excepcion: a.motivo_excepcion,
      observaciones: a.observaciones,
    },
  };
}

// Si la versión ya está cerrada se usa la que la reemplazó
export async function fotoReglaAscenso(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const select = {
    id: true,
    nombre: true,
    dias_minimos: true,
    edad_maxima: true,
    notas: true,
    activo: true,
    vigente_hasta: true,
    grado_origen_id: true,
    grado_origen: den,
    grado_destino: den,
    requisitos: {
      orderBy: { orden: 'asc' as const },
      select: {
        descripcion: true,
        anios_antiguedad: true,
        cursos: { select: { curso: { select: { nombre_curso: true } } } },
      },
    },
  };
  let r = await prisma.ascensos_reglas.findUnique({ where: { id }, select });
  if (!r) return null;
  if (r.vigente_hasta !== null) {
    const siguiente = await prisma.ascensos_reglas.findFirst({
      where: { grado_origen_id: r.grado_origen_id, id: { gt: r.id } },
      orderBy: { id: 'asc' },
      select,
    });
    if (siguiente) r = siguiente;
  }
  return {
    nombre: r.nombre,
    campos: {
      nombre: r.nombre,
      grado_origen: r.grado_origen.denominacion,
      grado_destino: r.grado_destino.denominacion,
      dias_minimos: r.dias_minimos,
      edad_maxima: r.edad_maxima,
      notas: r.notas,
      activo: r.activo,
      requisitos: r.requisitos.map((q) => {
        const cursos = q.cursos.map((c) => c.curso.nombre_curso).join(', ');
        const anios = q.anios_antiguedad ? `${q.anios_antiguedad} años` : '';
        const extra = [anios, cursos].filter(Boolean).join('; ');
        return extra ? `${q.descripcion} (${extra})` : q.descripcion;
      }),
    },
  };
}

// El documento sale de la orden (param id) y del slot de la ruta.
export async function fotoDocumentoOrdenAscenso(
  id: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
): Promise<FotoAuditoria | null> {
  if (!Object.values(SLOTS_DOCUMENTO).includes(params.slot as SlotDocumento)) return null;
  const o = await prisma.ascensos_ordenes.findUnique({
    where: { id },
    select: {
      numero_orden: true,
      archivo_orden: { select: { nombre_original: true } },
      archivo_boletin: { select: { nombre_original: true } },
    },
  });
  return o && fotoDeDocumento(o, params.slot, o.numero_orden ?? '', { orden: o.numero_orden });
}

@Injectable()
export class AscensosAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('orden_ascenso', fotoOrdenAscenso);
    this.fotos.registrar('ascenso', fotoAscenso);
    this.fotos.registrar('regla_ascenso', fotoReglaAscenso);
    this.fotos.registrar('documento_orden_ascenso', fotoDocumentoOrdenAscenso);
  }
}

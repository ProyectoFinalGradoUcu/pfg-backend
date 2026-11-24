import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, fotoDeDocumento, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import { nombreConvocatoria, nombrePersona, SELECT_NOMBRE_PERSONA } from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';

const ARCHIVO = { select: { nombre_original: true } } as const;

const SELECT_CONVOCATORIA = {
  numero_orden: true,
  boletin: true,
  fecha_salida: true,
  fecha_llegada: true,
  observaciones: true,
  misiones: { select: { nombre_mision: true } },
} as const;

export async function fotoMision(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const m = await prisma.misiones.findUnique({
    where: { id },
    select: {
      nombre_mision: true,
      pais: true,
      numero_orden: true,
      fecha_orden: true,
      boletin: true,
      fecha_boletin: true,
      resolucion_cje: true,
      convocatorias: { select: { numero_orden: true, boletin: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!m) return null;
  const { convocatorias, ...campos } = m;
  return {
    nombre: m.nombre_mision ?? '',
    campos: {
      ...campos,
      // Al borrar la misión se van también sus convocatorias.
      convocatorias: convocatorias.map((c) => c.numero_orden ?? c.boletin).filter(Boolean),
    },
  };
}

export async function fotoConvocatoria(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const c = await prisma.convocatorias.findUnique({
    where: { id },
    select: {
      ...SELECT_CONVOCATORIA,
      funcionarios: { select: { personas: { select: SELECT_NOMBRE_PERSONA } }, orderBy: { id: 'asc' } },
    },
  });
  if (!c) return null;
  const { misiones, funcionarios, ...campos } = c;
  return {
    nombre: nombreConvocatoria(c),
    campos: {
      mision: misiones?.nombre_mision ?? null,
      ...campos,
      funcionarios: funcionarios.map((f) => nombrePersona(f.personas)),
    },
  };
}

async function cargarAsignacion(where: { id: bigint } | { convocatoria_id: bigint; persona_id: bigint }, prisma: PrismaService) {
  const a = await prisma.funcionarios_convocatorias.findFirst({
    where,
    select: {
      numero_orden: true,
      boletin: true,
      observaciones: true,
      personas: { select: SELECT_NOMBRE_PERSONA },
      convocatorias: { select: { numero_orden: true, misiones: { select: { nombre_mision: true } } } },
      archivo_orden: ARCHIVO,
      archivo_boletin: ARCHIVO,
    },
  });
  if (!a) return null;
  const persona = nombrePersona(a.personas);
  const convocatoria = nombreConvocatoria(a.convocatorias);
  return {
    fila: a,
    nombre: [persona, convocatoria].filter(Boolean).join(' en '),
    campos: {
      persona,
      convocatoria,
      numero_orden: a.numero_orden,
      boletin: a.boletin,
      observaciones: a.observaciones,
    },
  };
}

// La asignación se busca por convocatoria y persona
export async function fotoAsignacionMision(
  personaId: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
): Promise<FotoAuditoria | null> {
  if (!params.convocatoriaId) return null;
  const a = await cargarAsignacion({ convocatoria_id: BigInt(params.convocatoriaId), persona_id: personaId }, prisma);
  return a && { nombre: a.nombre, campos: a.campos };
}

export async function fotoDocumentoConvocatoria(
  id: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
): Promise<FotoAuditoria | null> {
  const c = await prisma.convocatorias.findUnique({
    where: { id },
    select: {
      numero_orden: true,
      misiones: { select: { nombre_mision: true } },
      archivo_orden: ARCHIVO,
      archivo_boletin: ARCHIVO,
    },
  });
  if (!c) return null;
  const nombre = nombreConvocatoria(c);
  return fotoDeDocumento(c, params.slot, nombre, { convocatoria: nombre });
}

export async function fotoDocumentoAsignacionMision(
  id: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
): Promise<FotoAuditoria | null> {
  const a = await cargarAsignacion({ id }, prisma);
  if (!a) return null;
  return fotoDeDocumento(a.fila, params.slot, a.nombre, { persona: a.campos.persona, convocatoria: a.campos.convocatoria });
}

@Injectable()
export class MisionesAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('mision', fotoMision);
    this.fotos.registrar('convocatoria', fotoConvocatoria);
    this.fotos.registrar('asignacion_mision', fotoAsignacionMision);
    this.fotos.registrar('documento_convocatoria', fotoDocumentoConvocatoria);
    this.fotos.registrar('documento_asignacion_mision', fotoDocumentoAsignacionMision);
  }
}

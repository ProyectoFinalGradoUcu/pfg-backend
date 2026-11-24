import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, fotoDeDocumento, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import { nombrePersona, SELECT_NOMBRE_PERSONA } from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';

const ARCHIVO = { select: { nombre_original: true } } as const;

async function cargarDestino(id: bigint, prisma: PrismaService) {
  const d = await prisma.destinos.findUnique({
    where: { id },
    select: {
      fecha_inicio: true,
      fecha_fin: true,
      posicion_destino: true,
      numero_orden: true,
      fecha_orden: true,
      boletin: true,
      fecha_boletin: true,
      numero_destino: true,
      numero_resolucion: true,
      fecha_resolucion: true,
      observaciones: true,
      personas: { select: SELECT_NOMBRE_PERSONA },
      sub_unidades: { select: { denominacion: true } },
      unidades: { select: { denominacion: true } },
      archivo_orden: ARCHIVO,
      archivo_boletin: ARCHIVO,
    },
  });
  if (!d) return null;
  const persona = nombrePersona(d.personas);
  const lugar = d.sub_unidades?.denominacion ?? d.unidades?.denominacion ?? null;
  // "Sgto. Juan Pérez en B.A.I."
  return { fila: d, persona, nombre: [persona, lugar].filter(Boolean).join(' en ') };
}

export async function fotoDestino(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const d = await cargarDestino(id, prisma);
  if (!d) return null;
  const { personas: _p, sub_unidades, unidades, archivo_orden: _o, archivo_boletin: _b, ...campos } = d.fila; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    nombre: d.nombre,
    campos: {
      persona: d.persona,
      sub_unidad: sub_unidades?.denominacion ?? null,
      comando: unidades?.denominacion ?? null,
      ...campos,
    },
  };
}

export async function fotoDocumentoDestino(
  id: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
): Promise<FotoAuditoria | null> {
  const d = await cargarDestino(id, prisma);
  if (!d) return null;
  return fotoDeDocumento(d.fila, params.slot, d.nombre, { destino: d.nombre });
}

@Injectable()
export class DestinosAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('destino', fotoDestino);
    this.fotos.registrar('documento_destino', fotoDocumentoDestino);
  }
}

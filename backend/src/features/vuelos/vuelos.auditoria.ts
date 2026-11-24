import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AuditoriaFotos,
  type FotoAuditoria,
} from '../auditoria/auditoria-fotos';
import {
  nombrePersona,
  SELECT_NOMBRE_PERSONA,
} from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';
import { etiquetaPeriodo } from './vuelos.service';

export async function fotoUnidadVuelo(
  id: bigint,
  prisma: PrismaService,
): Promise<FotoAuditoria | null> {
  const u = await prisma.unidades_vuelo.findUnique({
    where: { id },
    select: { denominacion: true, vigente: true },
  });
  if (!u) return null;
  return {
    nombre: u.denominacion,
    campos: { denominacion: u.denominacion, vigente: u.vigente },
  };
}

export async function fotoPeriodoVuelo(
  id: bigint,
  prisma: PrismaService,
): Promise<FotoAuditoria | null> {
  const p = await prisma.periodos_vuelo.findUnique({
    where: { id },
    select: {
      anio: true,
      numero: true,
      cerrado: true,
      _count: { select: { registros_vuelo: true } },
    },
  });
  if (!p) return null;
  const periodo = etiquetaPeriodo(p);
  // La cantidad de registros muestra lo que sumó la sincronización
  return {
    nombre: periodo,
    campos: {
      periodo,
      cerrado: p.cerrado,
      registros: p._count.registros_vuelo,
    },
  };
}

export async function fotoRegistroVuelo(
  id: bigint,
  prisma: PrismaService,
): Promise<FotoAuditoria | null> {
  const r = await prisma.registros_vuelo.findUnique({
    where: { id },
    select: {
      aeronaves: true,
      hs_av_anio_militar: true,
      hs_av_total: true,
      hs_ob_anio_militar: true,
      hs_ob_total: true,
      personas: { select: SELECT_NOMBRE_PERSONA },
      periodos_vuelo: { select: { anio: true, numero: true } },
      unidades_vuelo: { select: { denominacion: true } },
    },
  });
  if (!r) return null;
  const persona = nombrePersona(r.personas);
  const periodo = etiquetaPeriodo(r.periodos_vuelo);
  return {
    nombre: [persona, `(${periodo})`].filter(Boolean).join(' '),
    campos: {
      persona,
      periodo,
      unidad_vuelo: r.unidades_vuelo?.denominacion ?? null,
      aeronaves: r.aeronaves,
      hs_av_anio_militar: r.hs_av_anio_militar,
      hs_av_total: r.hs_av_total,
      hs_ob_anio_militar: r.hs_ob_anio_militar,
      hs_ob_total: r.hs_ob_total,
    },
  };
}

@Injectable()
export class VuelosAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('unidad_vuelo', fotoUnidadVuelo);
    this.fotos.registrar('periodo_vuelo', fotoPeriodoVuelo);
    this.fotos.registrar('registro_vuelo', fotoRegistroVuelo);
  }
}

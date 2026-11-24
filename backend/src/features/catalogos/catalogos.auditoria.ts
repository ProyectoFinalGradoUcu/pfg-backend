import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AuditoriaFotos,
  type FotoAuditoria,
} from '../auditoria/auditoria-fotos.js';
import type { PrismaService } from '../../lib/prisma.service.js';

export async function fotoComando(
  id: bigint,
  prisma: PrismaService,
): Promise<FotoAuditoria | null> {
  const c = await prisma.unidades.findUnique({
    where: { id },
    select: { codigo: true, denominacion: true, vigente: true },
  });
  if (!c) return null;
  return {
    nombre: c.denominacion,
    campos: {
      codigo: c.codigo,
      denominacion: c.denominacion,
      vigente: c.vigente,
    },
  };
}

export async function fotoBase(
  id: bigint,
  prisma: PrismaService,
): Promise<FotoAuditoria | null> {
  const b = await prisma.sub_unidades.findUnique({
    where: { id },
    select: {
      codigo: true,
      denominacion: true,
      vigente: true,
      unidades: { select: { denominacion: true } },
    },
  });
  if (!b) return null;
  return {
    nombre: b.denominacion,
    campos: {
      codigo: b.codigo,
      denominacion: b.denominacion,
      comando: b.unidades?.denominacion ?? null,
      vigente: b.vigente,
    },
  };
}

@Injectable()
export class CatalogosAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('comando', fotoComando);
    this.fotos.registrar('base', fotoBase);
  }
}

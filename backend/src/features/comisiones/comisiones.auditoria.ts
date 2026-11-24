import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import { nombrePersona, SELECT_NOMBRE_PERSONA } from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';

const fecha = (f: Date | null | undefined) => (f ? f.toISOString().slice(0, 10) : null);

export async function fotoComision(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const c = await prisma.comisiones.findUnique({ where: { id }, select: { denominacion: true, vigente: true } });
  if (!c) return null;
  return { nombre: c.denominacion, campos: { denominacion: c.denominacion, vigente: c.vigente } };
}

// "Sgto. Juan Pérez en Comisión X"
export async function fotoAsignacionComision(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const a = await prisma.asignaciones_comision.findUnique({
    where: { id },
    select: {
      cargo: true,
      fecha_inicio: true,
      fecha_fin: true,
      numero_orden: true,
      boletin: true,
      personas: { select: SELECT_NOMBRE_PERSONA },
      comisiones: { select: { denominacion: true } },
    },
  });
  if (!a) return null;
  const persona = nombrePersona(a.personas);
  const comision = a.comisiones?.denominacion ?? null;
  return {
    nombre: [persona, comision].filter(Boolean).join(' en ') || 'asignación',
    campos: {
      persona,
      comision,
      cargo: a.cargo,
      fecha_inicio: fecha(a.fecha_inicio),
      fecha_fin: fecha(a.fecha_fin),
      numero_orden: a.numero_orden,
      boletin: a.boletin,
    },
  };
}

@Injectable()
export class ComisionesAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('comision', fotoComision);
    this.fotos.registrar('asignacion_comision', fotoAsignacionComision);
  }
}

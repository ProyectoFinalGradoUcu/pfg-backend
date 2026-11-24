import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import type { PrismaService } from '../../lib/prisma.service';

export async function fotoRol(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const r = await prisma.roles.findUnique({
    where: { id },
    select: {
      nombre: true,
      descripcion: true,
      roles_permisos: { select: { permisos: { select: { nombre: true, descripcion: true } } } },
    },
  });
  if (!r) return null;
  return {
    nombre: r.nombre,
    campos: {
      nombre: r.nombre,
      descripcion: r.descripcion,
      permisos: r.roles_permisos.map((rp) => rp.permisos.descripcion ?? rp.permisos.nombre),
    },
  };
}

@Injectable()
export class RolesAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('rol', fotoRol);
  }
}

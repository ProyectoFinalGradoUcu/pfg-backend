import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import { nombrePersona, SELECT_NOMBRE_PERSONA } from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';

// Sin el hash del token
export async function fotoInvitacion(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const i = await prisma.invitaciones.findUnique({
    where: { id },
    select: {
      email: true,
      estado: true,
      roles: true,
      expira_en: true,
      personas: { select: SELECT_NOMBRE_PERSONA },
      usuarios: { select: { username: true } },
    },
  });
  if (!i) return null;
  return {
    nombre: i.email,
    campos: {
      email: i.email,
      estado: i.estado,
      roles: i.roles,
      persona: nombrePersona(i.personas),
      creada_por: i.usuarios?.username ?? null,
      expira_en: i.expira_en,
    },
  };
}

@Injectable()
export class InvitacionesAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('invitacion', fotoInvitacion);
  }
}

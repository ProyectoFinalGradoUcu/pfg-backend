import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import { nombrePersona, SELECT_NOMBRE_PERSONA } from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';

// Usuario con roles y bases en texto, sin el hash
export async function fotoUsuario(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const u = await prisma.usuarios.findUnique({
    where: { id },
    select: {
      username: true,
      estado: true,
      personas: { select: SELECT_NOMBRE_PERSONA },
      usuarios_roles: { select: { roles: { select: { nombre: true } } } },
      usuarios_sub_unidades: { select: { sub_unidades: { select: { denominacion: true } } } },
    },
  });
  if (!u) return null;
  return {
    nombre: u.username,
    campos: {
      usuario: u.username,
      estado: u.estado,
      persona: nombrePersona(u.personas),
      roles: u.usuarios_roles.map((r) => r.roles.nombre),
      bases: u.usuarios_sub_unidades.map((s) => s.sub_unidades.denominacion),
    },
  };
}

@Injectable()
export class UsuariosAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('usuario', fotoUsuario);
  }
}

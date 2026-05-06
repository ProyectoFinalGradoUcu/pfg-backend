import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';

@Injectable()
export class PermisosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const permisos = await this.prisma.permisos.findMany({
      orderBy: { nombre: 'asc' },
    });
    return permisos.map((p) => ({
      id: p.id.toString(),
      nombre: p.nombre,
      descripcion: p.descripcion,
    }));
  }
}

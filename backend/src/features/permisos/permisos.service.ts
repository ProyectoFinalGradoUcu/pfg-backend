import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { Prisma } from '@prisma/client';
import { ListPermisosQueryDto } from './dto/list-permisos-query.dto';

@Injectable()
export class PermisosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListPermisosQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 100);
    const search = query.search?.trim();

    const where: Prisma.permisosWhereInput = search
      ? {
          OR: [
            { nombre: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { descripcion: { contains: search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {};

    const [total, permisos] = await this.prisma.$transaction([
      this.prisma.permisos.count({ where }),
      this.prisma.permisos.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: permisos.map((p) => ({
        id: p.id.toString(),
        nombre: p.nombre,
        descripcion: p.descripcion,
      })),
      total,
      page,
      pageSize,
    };
  }
}

import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import { CreateSubalternoDto } from './dto/create-subalterno.dto.js';
import { UpdateSubalternoDto } from './dto/update-subalterno.dto.js';

@Injectable()
export class SubalternosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSubalternoDto) {
    const existe = await this.prisma.personas.findUnique({
      where: { cedula: dto.cedula },
    });
    if (existe) {
      throw new ConflictException(
        `Ya existe una persona con cédula ${dto.cedula}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const persona = await tx.personas.create({
        data: {
          cedula: dto.cedula,
          primer_nombre: dto.primer_nombre,
          primer_apellido: dto.primer_apellido,
          segundo_nombre: dto.segundo_nombre,
          segundo_apellido: dto.segundo_apellido,
          fecha_nacimiento: dto.fecha_nacimiento
            ? new Date(dto.fecha_nacimiento)
            : undefined,
          email: dto.email,
          telefono: dto.telefono,
          direccion: dto.direccion,
          genero: dto.genero,
          estado_civil: dto.estado_civil,
          lugar_nacimiento: dto.lugar_nacimiento,
        },
      });

      const relacion = await tx.relaciones_laborales.create({
        data: {
          persona_id: persona.id,
          regimen_id: BigInt(dto.regimen_id),
          unidad_id: BigInt(dto.unidad_id),
          programa_id: BigInt(dto.programa_id),
          situacion_id: BigInt(dto.situacion_id),
          escalafon_id: BigInt(dto.escalafon_id),
          grado_id: BigInt(dto.grado_id),
          fecha_inicio: new Date(dto.fecha_inicio),
          estado: 'activo',
          tipo_funcionario: 'subalterno',
          compania_id: dto.compania_id
            ? BigInt(dto.compania_id)
            : undefined,
          observaciones: dto.observaciones,
        },
      });

      return {
        id: Number(persona.id),
        cedula: persona.cedula,
        primer_nombre: persona.primer_nombre,
        primer_apellido: persona.primer_apellido,
        segundo_nombre: persona.segundo_nombre,
        segundo_apellido: persona.segundo_apellido,
        fecha_nacimiento: persona.fecha_nacimiento,
        email: persona.email,
        telefono: persona.telefono,
        direccion: persona.direccion,
        genero: persona.genero,
        estado_civil: persona.estado_civil,
        lugar_nacimiento: persona.lugar_nacimiento,
        relacion_laboral: {
          id: Number(relacion.id),
          tipo_funcionario: relacion.tipo_funcionario,
          estado: relacion.estado,
          fecha_inicio: relacion.fecha_inicio,
          escalafon_id: Number(relacion.escalafon_id),
          grado_id: Number(relacion.grado_id),
          regimen_id: Number(relacion.regimen_id),
          unidad_id: Number(relacion.unidad_id),
          programa_id: Number(relacion.programa_id),
          situacion_id: Number(relacion.situacion_id),
        },
      };
    });
  }

  async update(id: number, dto: UpdateSubalternoDto) {
    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
    });
    if (!persona) {
      throw new NotFoundException(`No existe subalterno con id ${id}`);
    }

    const actualizada = await this.prisma.personas.update({
      where: { id: BigInt(id) },
      data: {
        direccion: dto.direccion,
        telefono: dto.telefono,
      },
    });

    return {
      id: Number(actualizada.id),
      cedula: actualizada.cedula,
      direccion: actualizada.direccion,
      telefono: actualizada.telefono,
    };
  }

  async remove(id: number) {
    const persona = await this.prisma.personas.findUnique({
      where: { id: BigInt(id) },
    });
    if (!persona) {
      throw new NotFoundException(`No existe subalterno con id ${id}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Primero borrar las relaciones laborales y luego la persona
      await tx.relaciones_laborales.deleteMany({
        where: { persona_id: BigInt(id) },
      });
      await tx.personas.delete({
        where: { id: BigInt(id) },
      });
    });

    return { id, eliminado: true };
  }
}

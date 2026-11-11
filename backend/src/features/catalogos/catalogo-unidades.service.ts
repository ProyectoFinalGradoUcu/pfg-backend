import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import { RELACION_ACTIVA } from '../../lib/alcance/alcance.where.js';
import { CreateComandoDto, UpdateComandoDto } from './dto/comando.dto.js';
import { CreateBaseDto, UpdateBaseDto } from './dto/base.dto.js';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Alta, edición y baja de comandos (`unidades`) y bases (`sub_unidades`).
 *
 * Las dos tablas son de liquidación y las comparte con nosotros:
 * - la baja es siempre lógica (`vigente = false`), porque sus tablas las referencian;
 * - el código no se edita, porque los scripts y liquidación referencian por código;
 * - una base no cambia de comando si alguna vez tuvo gente, destinos o cursos,
 *   porque `relaciones_laborales.unidad_id` (que usa liquidación) quedaría con el comando viejo;
 * - el código de una base es único en todo el catálogo, y no puede repetir el de un comando
 *   (así no se vuelve a cargar una base como si fuera un comando).
 */
@Injectable()
export class CatalogoUnidadesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Comandos ─────────────────────────────────────────────────────────────

  async crearComando(dto: CreateComandoDto) {
    await this.assertCodigoLibre(dto.codigo);
    await this.assertDenominacionComandoLibre(dto.denominacion);

    const comando = await this.prisma.unidades.create({
      data: { codigo: dto.codigo, denominacion: dto.denominacion, vigente: true },
    });
    return this.mapComando(comando, 0);
  }

  async editarComando(id: number, dto: UpdateComandoDto) {
    const comando = await this.prisma.unidades.findUnique({ where: { id: BigInt(id) } });
    if (!comando) throw new NotFoundException(`No existe el comando con id ${id}`);

    if (dto.denominacion !== undefined && dto.denominacion !== comando.denominacion) {
      await this.assertDenominacionComandoLibre(dto.denominacion, comando.id);
    }
    if (dto.vigente === false && comando.vigente) {
      await this.assertComandoSinUso(comando.id, comando.denominacion);
    }

    const actualizado = await this.prisma.unidades.update({
      where: { id: comando.id },
      data: {
        ...(dto.denominacion !== undefined && { denominacion: dto.denominacion }),
        ...(dto.vigente !== undefined && { vigente: dto.vigente }),
      },
    });
    const bases = await this.prisma.sub_unidades.count({ where: { unidad_id: comando.id, vigente: true } });
    return this.mapComando(actualizado, bases);
  }

  private async assertComandoSinUso(id: bigint, denominacion: string) {
    const [bases, relaciones] = await Promise.all([
      this.prisma.sub_unidades.count({ where: { unidad_id: id, vigente: true } }),
      this.prisma.relaciones_laborales.count({ where: { unidad_id: id, ...RELACION_ACTIVA } }),
    ]);
    if (bases > 0) {
      throw new ConflictException(
        `No se puede dar de baja el comando "${denominacion}": tiene ${plural(bases, 'base vigente', 'bases vigentes')}. ` +
          'Dalas de baja primero.',
      );
    }
    if (relaciones > 0) {
      throw new ConflictException(
        `No se puede dar de baja el comando "${denominacion}": hay ` +
          `${plural(relaciones, 'relación laboral vigente', 'relaciones laborales vigentes')} en él, ` +
          'y liquidación las usa para calcular sueldos.',
      );
    }
  }

  // ─── Bases ────────────────────────────────────────────────────────────────

  async crearBase(dto: CreateBaseDto) {
    const comando = await this.comandoVigente(dto.unidad_id);
    await this.assertCodigoLibre(dto.codigo);
    await this.assertDenominacionBaseLibre(dto.denominacion);

    const base = await this.prisma.sub_unidades.create({
      data: {
        unidad_id: comando.id,
        codigo: dto.codigo,
        denominacion: dto.denominacion,
        vigente: true,
      },
    });
    return this.mapBase(base, comando);
  }

  async editarBase(id: number, dto: UpdateBaseDto) {
    const base = await this.prisma.sub_unidades.findUnique({
      where: { id: BigInt(id) },
      include: { unidades: true },
    });
    if (!base) throw new NotFoundException(`No existe la base con id ${id}`);

    if (dto.denominacion !== undefined && dto.denominacion !== base.denominacion) {
      await this.assertDenominacionBaseLibre(dto.denominacion, base.id);
    }

    let comando = base.unidades;
    const cambiaComando = dto.unidad_id !== undefined && BigInt(dto.unidad_id) !== base.unidad_id;
    if (cambiaComando) {
      comando = await this.comandoVigente(dto.unidad_id!);
      await this.assertBaseNuncaUsada(base.id, base.denominacion);
    }

    if (dto.vigente === false && base.vigente) {
      await this.assertBaseSinUso(base.id, base.denominacion);
    }
    if (dto.vigente === true && !base.vigente && !comando.vigente) {
      throw new UnprocessableEntityException(
        `No se puede reactivar la base "${base.denominacion}": su comando "${comando.denominacion}" está dado de baja.`,
      );
    }

    const actualizada = await this.prisma.sub_unidades.update({
      where: { id: base.id },
      data: {
        ...(dto.denominacion !== undefined && { denominacion: dto.denominacion }),
        ...(cambiaComando && { unidad_id: comando.id }),
        ...(dto.vigente !== undefined && { vigente: dto.vigente }),
      },
    });
    return this.mapBase(actualizada, comando);
  }

  /** Para dar de baja: nadie revistando ni con relación laboral activa en la base. */
  private async assertBaseSinUso(id: bigint, denominacion: string) {
    const [destinados, relaciones] = await Promise.all([
      this.prisma.destinos.count({ where: { sub_unidad_id: id, fecha_fin: null } }),
      this.prisma.relaciones_laborales.count({ where: { sub_unidad_id: id, ...RELACION_ACTIVA } }),
    ]);
    if (destinados > 0) {
      throw new ConflictException(
        `No se puede dar de baja la base "${denominacion}": tiene ` +
          `${plural(destinados, 'funcionario con destino vigente', 'funcionarios con destino vigente')}. ` +
          'Reasignalos antes de darla de baja.',
      );
    }
    if (relaciones > 0) {
      throw new ConflictException(
        `No se puede dar de baja la base "${denominacion}": hay ` +
          `${plural(relaciones, 'relación laboral vigente', 'relaciones laborales vigentes')} en ella, ` +
          'y liquidación las usa para calcular sueldos.',
      );
    }
  }

  /** Para cambiar de comando: ni siquiera historial, porque esas filas guardan el comando viejo. */
  private async assertBaseNuncaUsada(id: bigint, denominacion: string) {
    const [relaciones, destinos, cursos] = await Promise.all([
      this.prisma.relaciones_laborales.count({ where: { sub_unidad_id: id } }),
      this.prisma.destinos.count({ where: { sub_unidad_id: id } }),
      this.prisma.cursos.count({ where: { sub_unidad_id: id } }),
    ]);
    if (relaciones + destinos + cursos > 0) {
      throw new ConflictException(
        `No se puede cambiar el comando de la base "${denominacion}": ya tiene relaciones laborales, ` +
          'destinos o cursos registrados con el comando actual, y liquidación usa ese comando. ' +
          'Si la base pasó a otro comando, dala de baja y creala de nuevo en el comando correcto.',
      );
    }
  }

  // ─── Reglas comunes ───────────────────────────────────────────────────────

  private async comandoVigente(unidadId: number) {
    const comando = await this.prisma.unidades.findUnique({ where: { id: BigInt(unidadId) } });
    if (!comando || !comando.vigente) {
      throw new UnprocessableEntityException('Comando no encontrado o dado de baja');
    }
    return comando;
  }

  /** Un código no puede repetirse ni entre comandos, ni entre bases, ni entre un comando y una base. */
  private async assertCodigoLibre(codigo: string) {
    const [comando, base] = await Promise.all([
      this.prisma.unidades.findFirst({
        where: { codigo: { equals: codigo, mode: 'insensitive' } },
        select: { denominacion: true },
      }),
      this.prisma.sub_unidades.findFirst({
        where: { codigo: { equals: codigo, mode: 'insensitive' } },
        select: { denominacion: true, unidades: { select: { denominacion: true } } },
      }),
    ]);
    if (comando) {
      throw new ConflictException(`El código "${codigo}" ya es del comando ${comando.denominacion}`);
    }
    if (base) {
      throw new ConflictException(
        `El código "${codigo}" ya es de la base ${base.denominacion} (${base.unidades.denominacion})`,
      );
    }
  }

  private async assertDenominacionComandoLibre(denominacion: string, exceptoId?: bigint) {
    const dup = await this.prisma.unidades.findFirst({
      where: {
        denominacion: { equals: denominacion, mode: 'insensitive' },
        ...(exceptoId !== undefined && { id: { not: exceptoId } }),
      },
    });
    if (dup) throw new ConflictException(`Ya existe un comando llamado "${denominacion}"`);
  }

  private async assertDenominacionBaseLibre(denominacion: string, exceptoId?: bigint) {
    const dup = await this.prisma.sub_unidades.findFirst({
      where: {
        denominacion: { equals: denominacion, mode: 'insensitive' },
        ...(exceptoId !== undefined && { id: { not: exceptoId } }),
      },
      select: { unidades: { select: { denominacion: true } } },
    });
    if (dup) {
      throw new ConflictException(
        `Ya existe una base llamada "${denominacion}" en el comando ${dup.unidades.denominacion}`,
      );
    }
  }

  private mapComando(
    c: { id: bigint; codigo: string; denominacion: string; vigente: boolean },
    totalBases: number,
  ) {
    return {
      id: Number(c.id),
      codigo: c.codigo,
      denominacion: c.denominacion,
      vigente: c.vigente,
      total_bases: totalBases,
    };
  }

  private mapBase(
    b: { id: bigint; codigo: string; denominacion: string; vigente: boolean; unidad_id: bigint },
    comando: { id: bigint; codigo: string; denominacion: string },
  ) {
    return {
      id: Number(b.id),
      codigo: b.codigo,
      denominacion: b.denominacion,
      vigente: b.vigente,
      unidad_id: Number(comando.id),
      comando: { id: Number(comando.id), codigo: comando.codigo, denominacion: comando.denominacion },
    };
  }
}

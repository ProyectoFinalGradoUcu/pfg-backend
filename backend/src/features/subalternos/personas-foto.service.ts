import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import type { AlcanceResuelto } from '../../lib/alcance/alcance.types.js';
import { ArchivoConStream, ArchivosService } from '../archivos/archivos.service.js';
import { RESTRICCIONES_IMAGEN } from '../archivos/archivos.restricciones.js';
import { assertPersonaAccesible } from './persona-accesible.js';

export interface FotoPersonal {
  /** Cambia con cada foto nueva: el front lo usa para versionar la URL. */
  foto_id: bigint;
}

@Injectable()
export class PersonasFotoService {
  private readonly logger = new Logger(PersonasFotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly archivos: ArchivosService,
  ) {}

  /** Carga la foto, o la reemplaza si ya tenía: la anterior se da de baja de MinIO. */
  async cargar(
    personaId: number,
    archivo: Express.Multer.File,
    usuarioId: bigint,
    alcance?: AlcanceResuelto,
  ): Promise<FotoPersonal> {
    const id = BigInt(personaId);
    const anterior = await this.fotoActual(id, alcance);

    const guardada = await this.archivos.guardar({
      entidad: 'personas',
      entidadId: id,
      slot: 'foto',
      nombreOriginal: archivo.originalname,
      buffer: archivo.buffer,
      mimetype: archivo.mimetype,
      usuarioId,
      restricciones: RESTRICCIONES_IMAGEN,
    });

    let enganchada: boolean;
    try {
      // Condicionado a la foto que había: de dos cargas simultáneas, solo una queda.
      const { count } = await this.prisma.personas.updateMany({
        where: { id, foto_archivo_id: anterior },
        data: { foto_archivo_id: guardada.id },
      });
      enganchada = count > 0;
    } catch (err) {
      await this.darDeBaja(guardada.id, usuarioId);
      this.logger.error(`No se pudo registrar la foto del archivo ${guardada.id}`, err as Error);
      throw new InternalServerErrorException('Error al registrar la foto');
    }

    if (!enganchada) {
      await this.darDeBaja(guardada.id, usuarioId);
      throw new ConflictException(
        'La foto del funcionario cambió mientras se subía. Volvé a intentar.',
      );
    }

    if (anterior !== null) await this.darDeBaja(anterior, usuarioId);
    return { foto_id: guardada.id };
  }

  async obtener(personaId: number, alcance?: AlcanceResuelto): Promise<ArchivoConStream> {
    const archivoId = await this.fotoActual(BigInt(personaId), alcance);
    if (archivoId === null) {
      throw new NotFoundException('El funcionario no tiene foto');
    }
    return this.archivos.obtener(archivoId);
  }

  async quitar(personaId: number, usuarioId: bigint, alcance?: AlcanceResuelto): Promise<null> {
    const id = BigInt(personaId);
    const archivoId = await this.fotoActual(id, alcance);
    if (archivoId === null) {
      throw new NotFoundException('El funcionario no tiene foto');
    }

    const { count } = await this.prisma.personas.updateMany({
      where: { id, foto_archivo_id: archivoId },
      data: { foto_archivo_id: null },
    });
    if (count === 0) {
      throw new NotFoundException('El funcionario no tiene foto');
    }

    await this.darDeBaja(archivoId, usuarioId);
    return null;
  }

  private async fotoActual(id: bigint, alcance?: AlcanceResuelto): Promise<bigint | null> {
    await assertPersonaAccesible(this.prisma, id, alcance);
    const persona = await this.prisma.personas.findUnique({
      where: { id },
      select: { foto_archivo_id: true },
    });
    return persona?.foto_archivo_id ?? null;
  }

  // La persona ya no apunta a este archivo: si la baja falla, solo queda un objeto huérfano.
  private async darDeBaja(archivoId: bigint, usuarioId: bigint): Promise<void> {
    await this.archivos.eliminar(archivoId, usuarioId).catch((err) => {
      this.logger.error(`Archivo huérfano id=${archivoId}`, err as Error);
    });
  }
}

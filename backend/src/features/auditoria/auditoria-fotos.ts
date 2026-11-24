import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';

// Foto del registro con los catálogos ya en texto
export interface FotoAuditoria {
  nombre: string;
  campos: Record<string, unknown>;
}

export type CargadorFoto = (
  id: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
) => Promise<FotoAuditoria | null>;

// Cada módulo registra sus fotos al iniciar
@Injectable()
export class AuditoriaFotos {
  private readonly logger = new Logger(AuditoriaFotos.name);
  private readonly cargadores = new Map<string, CargadorFoto>();

  constructor(private readonly prisma: PrismaService) {}

  registrar(tipo: string, cargador: CargadorFoto): void {
    if (this.cargadores.has(tipo)) this.logger.warn(`La foto "${tipo}" ya estaba registrada, se reemplaza`);
    this.cargadores.set(tipo, cargador);
  }

  tiene(tipo: string): boolean {
    return this.cargadores.has(tipo);
  }

  // Si falla devuelve null y se audita igual
  async cargar(
    tipo: string,
    id: string | number | bigint | null | undefined,
    params: Record<string, string> = {},
  ): Promise<FotoAuditoria | null> {
    if (id === null || id === undefined || id === '') return null;
    const cargador = this.cargadores.get(tipo);
    if (!cargador) {
      this.logger.warn(`No hay foto registrada para "${tipo}"`);
      return null;
    }
    try {
      return await cargador(BigInt(id), this.prisma, params);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo sacar la foto de ${tipo} ${String(id)}: ${mensaje}`);
      return null;
    }
  }
}

interface FilaConDocumentos {
  archivo_orden: { nombre_original: string } | null;
  archivo_boletin: { nombre_original: string } | null;
}

const DOCUMENTO_SLOT: Record<string, string> = { orden: 'Orden', boletin: 'Resolución' };

// Documento de un slot de orden o resolución
export function fotoDeDocumento(
  fila: FilaConDocumentos,
  slot: string | undefined,
  nombre: string,
  registro: Record<string, unknown>,
): FotoAuditoria | null {
  const archivo = slot === 'orden' ? fila.archivo_orden : slot === 'boletin' ? fila.archivo_boletin : null;
  if (!archivo) return null;
  return { nombre, campos: { ...registro, documento: DOCUMENTO_SLOT[slot!], archivo: archivo.nombre_original } };
}

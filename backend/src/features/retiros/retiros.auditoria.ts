import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, fotoDeDocumento, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import { nombrePersona, SELECT_NOMBRE_PERSONA } from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';
import { relacionesDeLaReincorporacion, soloFecha, soloHora } from './retiros.service';
import { SLOTS_DOCUMENTO_RETIRO, type SlotDocumentoRetiro } from './retiros-documentos.service';

const den = { select: { denominacion: true } } as const;
const numero = (v: unknown) => (v == null ? null : Number(v));

// Lo que se ve y se corrige del retiro
export async function fotoRetiro(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const r = await prisma.retiros.findUnique({
    where: { id },
    select: {
      fecha_retiro: true,
      hora_retiro: true,
      motivo: true,
      numero_orden: true,
      boletin: true,
      observaciones: true,
      personas: { select: SELECT_NOMBRE_PERSONA },
      motivos_baja: den,
      relaciones_laborales: { select: { grados: den, sub_unidades: den } },
    },
  });
  if (!r) return null;
  const persona = nombrePersona(r.personas);
  return {
    nombre: persona ?? 'funcionario',
    campos: {
      persona,
      grado: r.relaciones_laborales?.grados?.denominacion ?? null,
      sub_unidad: r.relaciones_laborales?.sub_unidades?.denominacion ?? null,
      fecha_retiro: soloFecha(r.fecha_retiro),
      hora_retiro: soloHora(r.hora_retiro),
      motivo_baja: r.motivos_baja?.denominacion ?? null,
      motivo: r.motivo,
      numero_orden: r.numero_orden,
      boletin: r.boletin,
      observaciones: r.observaciones,
    },
  };
}

// La reincorporación es la relación que se abrió después del retiro
export async function fotoReincorporacion(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const retiro = await prisma.retiros.findUnique({
    where: { id },
    select: { persona_id: true, fecha_retiro: true, personas: { select: SELECT_NOMBRE_PERSONA } },
  });
  if (!retiro) return null;
  const relaciones = await relacionesDeLaReincorporacion(prisma, retiro);
  if (!relaciones) return null;
  const { actual, primera } = relaciones;
  const lugar = await prisma.relaciones_laborales.findUnique({
    where: { id: actual.id },
    select: { grados: den, sub_unidades: den },
  });
  const persona = nombrePersona(retiro.personas);
  return {
    nombre: persona ?? 'funcionario',
    campos: {
      persona,
      fecha_reincorporacion: soloFecha(primera.fecha_inicio as Date),
      situacion: actual.situaciones?.denominacion ?? null,
      grado: lugar?.grados?.denominacion ?? null,
      sub_unidad: lugar?.sub_unidades?.denominacion ?? null,
      grado_reincorporacion: actual.grados_relaciones_laborales_grado_reincorporacion_idTogrados?.denominacion ?? null,
      haber_retiro: numero(actual.haber_retiro),
      porcentaje_progresivo: numero(actual.porcentaje_progresivo),
    },
  };
}

// El documento sale del retiro (param id) y del slot de la ruta.
export async function fotoDocumentoRetiro(
  id: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
): Promise<FotoAuditoria | null> {
  if (!Object.values(SLOTS_DOCUMENTO_RETIRO).includes(params.slot as SlotDocumentoRetiro)) return null;
  const r = await prisma.retiros.findUnique({
    where: { id },
    select: {
      personas: { select: SELECT_NOMBRE_PERSONA },
      archivo_orden: { select: { nombre_original: true } },
      archivo_boletin: { select: { nombre_original: true } },
    },
  });
  if (!r) return null;
  const persona = nombrePersona(r.personas);
  return fotoDeDocumento(r, params.slot, persona ?? '', { retiro: persona });
}

@Injectable()
export class RetirosAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('retiro', fotoRetiro);
    this.fotos.registrar('reincorporacion', fotoReincorporacion);
    this.fotos.registrar('documento_retiro', fotoDocumentoRetiro);
  }
}

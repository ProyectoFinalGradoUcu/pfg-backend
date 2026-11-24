import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditoriaFotos, type FotoAuditoria } from '../auditoria/auditoria-fotos';
import { nombrePersona, SELECT_NOMBRE_PERSONA } from '../auditoria/auditoria-nombres';
import type { PrismaService } from '../../lib/prisma.service';
import { textoCodigo } from '../auditoria/auditoria-cambios';
import { PRIMA_TECNICA_VACIA } from '../ascensos/ascensos.constants';
import { ETIQUETAS_NIVEL_EDUCATIVO, type NivelEducativo } from './legajo-militar.constants';

const den = { select: { denominacion: true } } as const;

const etiquetaNivel = (nivel: string | null | undefined) =>
  nivel ? (ETIQUETAS_NIVEL_EDUCATIVO[nivel as NivelEducativo] ?? nivel) : null;

// Ficha de la persona como se edita en el perfil
export async function fotoPersona(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const p = await prisma.personas.findUnique({
    where: { id },
    select: {
      cedula: true,
      primer_nombre: true,
      segundo_nombre: true,
      primer_apellido: true,
      segundo_apellido: true,
      fecha_nacimiento: true,
      email: true,
      telefono: true,
      direccion: true,
      codigo_postal: true,
      departamento: true,
      localidad: true,
      genero: true,
      etnia: true,
      estado_civil: true,
      lugar_nacimiento: true,
      seccional: true,
      credencial_civica: true,
      nivel_idoneidad: true,
      fecha_fallecimiento: true,
      es_civil: true,
      legajo_militar: {
        select: { nivel_educativo: true, fecha_ingreso_eta: true, fecha_egreso_eta: true, numero_orden_egreso_eta: true },
      },
      relaciones_laborales: {
        orderBy: [{ fecha_inicio: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          tipo_funcionario: true,
          fecha_inicio: true,
          prima_tecnica: true,
          tiene_mando: true,
          observaciones: true,
          codigos_legajo: true,
          mutaciones: true,
          derecha: true,
          numor: true,
          grados: den,
          escalafones: den,
          regimenes: den,
          programas: den,
          situaciones: den,
          sub_unidades: den,
          unidades: den,
        },
      },
    },
  });
  if (!p) return null;
  const r = p.relaciones_laborales[0];
  const { legajo_militar: legajo, relaciones_laborales: _relaciones, ...personales } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    nombre: nombrePersona({ ...p, relaciones_laborales: r ? [{ grados: r.grados }] : [] }) ?? p.cedula,
    campos: {
      ...personales,
      tipo_funcionario: textoCodigo(r?.tipo_funcionario),
      grado: r?.grados?.denominacion ?? null,
      escalafon: r?.escalafones?.denominacion ?? null,
      regimen: r?.regimenes?.denominacion ?? null,
      programa: r?.programas?.denominacion ?? null,
      situacion: r?.situaciones?.denominacion ?? null,
      sub_unidad: r?.sub_unidades?.denominacion ?? null,
      unidad: r?.unidades?.denominacion ?? null,
      fecha_inicio: r?.fecha_inicio ?? null,
      // Liquidación guarda 'VACIO' cuando no hay prima
      prima_tecnica: r?.prima_tecnica && r.prima_tecnica !== PRIMA_TECNICA_VACIA ? r.prima_tecnica : null,
      tiene_mando: r?.tiene_mando ?? null,
      observaciones_laborales: r?.observaciones ?? null,
      codigos_legajo: r?.codigos_legajo ?? null,
      derecha: r?.derecha ?? null,
      numor: r?.numor ?? null,
      mutaciones: r?.mutaciones ?? null,
      nivel_educativo: etiquetaNivel(legajo?.nivel_educativo),
      fecha_ingreso_eta: legajo?.fecha_ingreso_eta ?? null,
      fecha_egreso_eta: legajo?.fecha_egreso_eta ?? null,
      numero_orden_egreso_eta: legajo?.numero_orden_egreso_eta ?? null,
    },
  };
}

// Solo lo que se guarda desde la pestaña del legajo militar.
export async function fotoLegajoMilitar(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const foto = await fotoPersona(id, prisma);
  if (!foto) return null;
  const c = foto.campos;
  return {
    nombre: foto.nombre,
    campos: {
      nivel_educativo: c.nivel_educativo,
      fecha_ingreso_eta: c.fecha_ingreso_eta,
      fecha_egreso_eta: c.fecha_egreso_eta,
      numero_orden_egreso_eta: c.numero_orden_egreso_eta,
      mutaciones: c.mutaciones,
    },
  };
}

export async function fotoDeFotoPersona(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const p = await prisma.personas.findUnique({
    where: { id },
    select: { ...SELECT_NOMBRE_PERSONA, foto_archivo: { select: { nombre_original: true } } },
  });
  if (!p) return null;
  return { nombre: nombrePersona(p) ?? '', campos: { foto: p.foto_archivo?.nombre_original ?? null } };
}

export async function fotoDocumentoPersona(id: bigint, prisma: PrismaService): Promise<FotoAuditoria | null> {
  const d = await prisma.personas_documentos.findUnique({
    where: { id },
    select: {
      descripcion: true,
      archivos: { select: { nombre_original: true } },
      personas: { select: SELECT_NOMBRE_PERSONA },
    },
  });
  if (!d) return null;
  return {
    nombre: d.archivos?.nombre_original ?? 'documento',
    campos: { persona: nombrePersona(d.personas), archivo: d.archivos?.nombre_original ?? null, descripcion: d.descripcion },
  };
}

// El vínculo puede estar guardado en cualquier sentido
export async function fotoFamiliar(
  familiarId: bigint,
  prisma: PrismaService,
  params: Record<string, string>,
): Promise<FotoAuditoria | null> {
  const personaId = BigInt(params.id);
  const [vinculo, personas] = await Promise.all([
    prisma.relaciones_familiares.findFirst({
      where: {
        OR: [
          { persona_id: personaId, familiar_id: familiarId },
          { persona_id: familiarId, familiar_id: personaId },
        ],
      },
      select: { tipo_relacion: true, observaciones: true },
    }),
    prisma.personas.findMany({ where: { id: { in: [personaId, familiarId] } }, select: SELECT_NOMBRE_PERSONA }),
  ]);
  if (!vinculo) return null;
  const nombre = (id: bigint) => nombrePersona(personas.find((p) => p.id === id));
  return {
    nombre: nombre(familiarId) ?? 'familiar',
    campos: {
      persona: nombre(personaId),
      familiar: nombre(familiarId),
      tipo_relacion: vinculo.tipo_relacion,
      observaciones: vinculo.observaciones,
    },
  };
}

@Injectable()
export class SubalternosAuditoria implements OnModuleInit {
  constructor(private readonly fotos: AuditoriaFotos) {}

  onModuleInit() {
    this.fotos.registrar('persona', fotoPersona);
    this.fotos.registrar('legajo_militar', fotoLegajoMilitar);
    this.fotos.registrar('foto_persona', fotoDeFotoPersona);
    this.fotos.registrar('documento_persona', fotoDocumentoPersona);
    this.fotos.registrar('familiar', fotoFamiliar);
  }
}

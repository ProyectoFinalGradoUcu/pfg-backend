import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min, validateSync } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { ESCALAS_DERECHA, NOMBRES_ESCALA } from '../../features/derecha/derecha.constants.js';
import type { EscalaDerecha } from '../../features/derecha/derecha.constants.js';

export const ORDENAR_POR_DERECHA_NUMOR = ['derecha', 'numor', 'apellido'] as const;
export type OrdenarPorDerechaNumor = (typeof ORDENAR_POR_DERECHA_NUMOR)[number];

export const DIRECCIONES_ORDEN = ['ASC', 'DESC'] as const;
export type DireccionOrden = (typeof DIRECCIONES_ORDEN)[number];

const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === null || value === '' ? undefined : Number(value);

const vacioAUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

/**
 * Filtro y orden por derecha y numor, común a personal, inscripciones a cursos y
 * reportes. La derecha se numera por escala y el numor por (grado, escalafón):
 * "derecha 1 a 10" trae los diez primeros de cada escala y "numor 1 a 1" el
 * primero de cada grupo.
 */
export class FiltroDerechaNumorDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  derechaDesde?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  derechaHasta?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  numorDesde?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  numorHasta?: number;

  @ApiPropertyOptional({ example: 14, description: 'ID de grado' })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  gradoId?: number;

  @ApiPropertyOptional({ example: 1, description: 'ID de escalafón' })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  escalafonId?: number;

  @ApiPropertyOptional({ enum: ESCALAS_DERECHA, description: 'Escala de la derecha' })
  @IsOptional()
  @Transform(vacioAUndefined)
  @IsIn([...ESCALAS_DERECHA])
  escala?: EscalaDerecha;

  @ApiPropertyOptional({ enum: ORDENAR_POR_DERECHA_NUMOR, default: 'derecha' })
  @IsOptional()
  @Transform(vacioAUndefined)
  @IsIn([...ORDENAR_POR_DERECHA_NUMOR])
  ordenarPor?: OrdenarPorDerechaNumor;

  @ApiPropertyOptional({ enum: DIRECCIONES_ORDEN, default: 'ASC' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value !== '' ? value.toUpperCase() : undefined))
  @IsIn([...DIRECCIONES_ORDEN])
  direccion?: DireccionOrden;
}

const CAMPOS_FILTRO = [
  'derechaDesde',
  'derechaHasta',
  'numorDesde',
  'numorHasta',
  'gradoId',
  'escalafonId',
  'escala',
] as const;

export function tieneFiltroDerechaNumor(f: FiltroDerechaNumorDto) {
  return CAMPOS_FILTRO.some((c) => f[c] !== undefined && f[c] !== null);
}

const rango = (desde: number | undefined, hasta: number | undefined, campo: string) => {
  if (desde !== undefined && hasta !== undefined && desde > hasta) {
    throw new BadRequestException(`${campo}: "desde" (${desde}) no puede ser mayor que "hasta" (${hasta})`);
  }
  if (desde === undefined && hasta === undefined) return undefined;
  return { ...(desde !== undefined && { gte: desde }), ...(hasta !== undefined && { lte: hasta }) };
};

/** `where` sobre `relaciones_laborales`. */
export function whereRelacionPorDerechaNumor(f: FiltroDerechaNumorDto): Prisma.relaciones_laboralesWhereInput {
  const derecha = rango(f.derechaDesde, f.derechaHasta, 'Derecha');
  const numor = rango(f.numorDesde, f.numorHasta, 'Numor');
  return {
    ...(derecha && { derecha }),
    ...(numor && { numor }),
    ...(f.gradoId && { grado_id: BigInt(f.gradoId) }),
    ...(f.escalafonId && { escalafon_id: BigInt(f.escalafonId) }),
    ...(f.escala && { escala_derecha: f.escala }),
  };
}

/**
 * `orderBy` sobre `relaciones_laborales`. Por numor siempre se ordena antes por
 * jerarquía de grado y por escalafón, porque el numor se repite entre grupos.
 */
export function orderByRelacionPorDerechaNumor(
  f: FiltroDerechaNumorDto,
): Prisma.relaciones_laboralesOrderByWithRelationInput[] {
  const dir = (f.direccion ?? 'ASC').toLowerCase() as Prisma.SortOrder;
  const escala = { escala_derecha: { sort: dir, nulls: 'last' as const } };
  switch (f.ordenarPor ?? 'derecha') {
    case 'apellido':
      return [{ personas: { primer_apellido: dir } }, { personas: { primer_nombre: dir } }];
    case 'numor':
      return [
        escala,
        { grados: { derecha_jerarquia: { posicion: dir } } },
        { escalafones: { codigo: dir } },
        { numor: { sort: dir, nulls: 'last' } },
      ];
    default:
      return [escala, { derecha: { sort: dir, nulls: 'last' } }];
  }
}

/**
 * Prisma no ordena `personas` por un campo de una relación 1:N, así que los
 * listados que parten de personas ordenan sus IDs con esto y paginan después.
 * Las personas sin relación vigente van al final, en el orden recibido.
 */
export async function ordenarPersonasPorDerechaNumor(
  prisma: PrismaService,
  personaIds: bigint[],
  f: FiltroDerechaNumorDto,
): Promise<bigint[]> {
  if (personaIds.length === 0) return [];
  const dir = (f.direccion ?? 'ASC').toLowerCase() as Prisma.SortOrder;

  if (f.ordenarPor === 'apellido') {
    const personas = await prisma.personas.findMany({
      where: { id: { in: personaIds } },
      select: { id: true },
      orderBy: [{ primer_apellido: dir }, { primer_nombre: dir }, { id: 'asc' }],
    });
    return personas.map((p) => p.id);
  }

  const relaciones = await prisma.relaciones_laborales.findMany({
    where: { persona_id: { in: personaIds }, fecha_fin: null },
    select: { persona_id: true },
    orderBy: [...orderByRelacionPorDerechaNumor(f), { persona_id: 'asc' }],
  });
  const ordenados = [...new Set(relaciones.map((r) => r.persona_id))];
  const vistos = new Set(ordenados.map(String));
  return [...ordenados, ...personaIds.filter((id) => !vistos.has(String(id)))];
}

/** Para filtros que llegan como texto, como los de los reportes. */
export function filtroDerechaNumorDesdeTexto(filtros: Record<string, string | undefined>): FiltroDerechaNumorDto {
  const dto = plainToInstance(FiltroDerechaNumorDto, filtros);
  const errores = validateSync(dto, { forbidUnknownValues: false });
  if (errores.length > 0) {
    throw new BadRequestException(
      errores.flatMap((e) => Object.values(e.constraints ?? {})).join('; '),
    );
  }
  return dto;
}

const ETIQUETAS_ORDEN: Record<OrdenarPorDerechaNumor, string> = {
  derecha: 'Derecha',
  numor: 'Numor (grado › escalafón › numor)',
  apellido: 'Apellido',
};

/** Texto del criterio aplicado, para el encabezado de los reportes exportados. */
export function describirFiltroDerechaNumor(
  f: FiltroDerechaNumorDto,
  nombres: { grado?: string | null; escalafon?: string | null } = {},
) {
  const tramo = (desde?: number, hasta?: number) =>
    desde !== undefined && hasta !== undefined
      ? `${desde} a ${hasta}`
      : desde !== undefined
        ? `desde ${desde}`
        : `hasta ${hasta}`;

  const partes = [
    f.escala && `Escala: ${NOMBRES_ESCALA[f.escala]}`,
    f.gradoId && `Grado: ${nombres.grado ?? f.gradoId}`,
    f.escalafonId && `Escalafón: ${nombres.escalafon ?? f.escalafonId}`,
    (f.derechaDesde !== undefined || f.derechaHasta !== undefined) &&
      `Derecha ${tramo(f.derechaDesde, f.derechaHasta)}`,
    (f.numorDesde !== undefined || f.numorHasta !== undefined) &&
      `Numor ${tramo(f.numorDesde, f.numorHasta)}`,
  ].filter(Boolean);

  return {
    filtro: partes.length ? partes.join(' · ') : 'Sin filtro de derecha ni numor',
    orden: `${ETIQUETAS_ORDEN[f.ordenarPor ?? 'derecha']}, ${(f.direccion ?? 'ASC') === 'ASC' ? 'ascendente' : 'descendente'}`,
  };
}

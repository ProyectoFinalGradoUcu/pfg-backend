import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Filtro de query por varios IDs: acepta `2,5`, el parámetro repetido (`?x=2&x=5`) o un
 * ID suelto, y siempre deja un array. Vacío equivale a no filtrar.
 */
export function FiltroListaIds(description: string, example = '2,5') {
  return applyDecorators(
    ApiPropertyOptional({ type: String, example, description }),
    IsOptional(),
    Transform(({ value }) =>
      (Array.isArray(value) ? value : String(value).split(','))
        .map((v) => String(v).trim())
        .filter((v) => v !== '')
        .map(Number),
    ),
    IsInt({ each: true }),
    Min(1, { each: true }),
  );
}

/** Condición Prisma `{ in: [...] }`, o `undefined` si la lista viene vacía. */
export function enIds(ids?: number[]) {
  return ids?.length ? { in: ids.map((id) => BigInt(id)) } : undefined;
}
